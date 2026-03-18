/**
 * Alexa-Claude Voice Connector
 * AWS Lambda Handler for Alexa Custom Skill
 */

const Alexa = require('ask-sdk-core');
const { ClaudeClient, MODELS } = require('./claude-client');
const { ConversationStore } = require('./persistence');
const {
  PRODUCT_ID,
  FREE_DAILY_LIMIT,
  getSubscriptionStatus,
  getBuyDirective,
  getCancelDirective,
  getUpsellDirective,
  getUsageCount,
  incrementUsage
} = require('./isp-helper');
const {
  supportsAPL,
  createChatResponseDirective,
  createWelcomeDirective
} = require('./apl-helper');
const {
  getSpeakerInfo,
  getPersonalizedGreeting
} = require('./personalization-helper');
const {
  createReminder,
  isReminderRequest,
  extractReminderInfo
} = require('./reminder-helper');

// 環境変数からAPIキーを取得
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;

// ClaudeClientインスタンス（リクエストごとに状態をリストアする）
let claudeClient = null;

// DynamoDB永続化（環境変数でテーブル名が設定されている場合のみ有効）
const conversationStore = process.env.DYNAMODB_TABLE_NAME ? new ConversationStore() : null;

/**
 * ユーザーIDを取得
 */
function getUserId(handlerInput) {
  return handlerInput.requestEnvelope.context.System.user.userId;
}

/**
 * ClaudeClientを取得または初期化
 */
function getClaudeClient(sessionAttributes) {
  if (!claudeClient) {
    claudeClient = new ClaudeClient(ANTHROPIC_API_KEY, BRAVE_SEARCH_API_KEY);
  }

  // セッション属性から状態を復元
  if (sessionAttributes.currentModel) {
    claudeClient.currentModel = sessionAttributes.currentModel;
  }
  if (sessionAttributes.currentPersona) {
    claudeClient.currentPersona = sessionAttributes.currentPersona;
  }

  return claudeClient;
}

/**
 * Progressive Responseを送信する
 * API応答待ち中のタイムアウトを回避
 */
async function sendProgressiveResponse(handlerInput, message) {
  const { requestEnvelope, serviceClientFactory } = handlerInput;
  const directiveServiceClient = serviceClientFactory.getDirectiveServiceClient();

  const directive = {
    header: {
      requestId: requestEnvelope.request.requestId
    },
    directive: {
      type: 'VoicePlayer.Speak',
      speech: message
    }
  };

  try {
    await directiveServiceClient.enqueue(directive);
  } catch (error) {
    console.error('Progressive Response Error:', error);
  }
}

/**
 * LaunchRequest Handler
 * スキル起動時の処理
 */
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    // パーソナライズ：話者情報を取得
    const speakerInfo = await getSpeakerInfo(handlerInput);
    sessionAttributes.speakerName = speakerInfo.name;
    sessionAttributes.personId = speakerInfo.personId;

    // パーソナライズされた挨拶を生成
    const greeting = getPersonalizedGreeting(speakerInfo);
    let speakOutput = `${greeting} クロ先生です。何でも聞いてください。`;

    // DynamoDBから会話履歴を復元（有効な場合）
    if (conversationStore) {
      const userId = getUserId(handlerInput);
      const savedState = await conversationStore.getConversation(userId);

      if (savedState.conversationHistory.length > 0) {
        sessionAttributes.conversationHistory = savedState.conversationHistory;
        sessionAttributes.currentPersona = savedState.currentPersona;
        sessionAttributes.currentModel = savedState.currentModel;
        speakOutput = `${greeting} 前回の会話を覚えています。続きをどうぞ。`;
      } else {
        sessionAttributes.conversationHistory = [];
        sessionAttributes.currentPersona = 'default';
        sessionAttributes.currentModel = null;
      }
    } else {
      // セッション属性を初期化
      sessionAttributes.conversationHistory = [];
      sessionAttributes.currentModel = null;
      sessionAttributes.currentPersona = 'default';
    }

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    // レスポンスを構築
    const responseBuilder = handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('何か質問はありますか？');

    // APL対応デバイスの場合、ウェルカム画面を表示
    if (supportsAPL(handlerInput)) {
      responseBuilder.addDirective(createWelcomeDirective(speakerInfo.name));
    } else {
      responseBuilder.withSimpleCard('クロ先生', speakOutput);
    }

    return responseBuilder.getResponse();
  }
};

/**
 * ChatIntent Handler
 * ユーザーの発話をClaude APIに送信
 */
const ChatIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ChatIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const client = getClaudeClient(sessionAttributes);

    // ユーザーの発話を取得
    const query = Alexa.getSlotValue(handlerInput.requestEnvelope, 'query');

    if (!query) {
      return handlerInput.responseBuilder
        .speak('すみません、聞き取れませんでした。もう一度お願いします。')
        .reprompt('何か質問はありますか？')
        .getResponse();
    }

    // サブスクリプション状態と利用回数をチェック
    const { entitled, product } = await getSubscriptionStatus(handlerInput);
    const usageCount = getUsageCount(sessionAttributes);

    // 無料ユーザーで制限超過の場合
    if (!entitled && usageCount >= FREE_DAILY_LIMIT) {
      if (product) {
        // アップセルを提案
        return handlerInput.responseBuilder
          .addDirective(getUpsellDirective(
            product.productId,
            `本日の無料枠${FREE_DAILY_LIMIT}回を使い切りました。プレミアムプランに登録すると無制限でお使いいただけます。`
          ))
          .getResponse();
      }
      return handlerInput.responseBuilder
        .speak(`申し訳ありません。本日の無料枠${FREE_DAILY_LIMIT}回を使い切りました。明日またお試しください。`)
        .withShouldEndSession(true)
        .getResponse();
    }

    // 無料ユーザーはHaikuモデルに強制
    if (!entitled && client.currentModel !== MODELS.HAIKU) {
      client.currentModel = MODELS.HAIKU;
      sessionAttributes.currentModel = MODELS.HAIKU;
    }

    // Progressive Responseを送信（考え中...）
    await sendProgressiveResponse(handlerInput, '考え中です...');

    try {
      // 会話履歴を取得
      const conversationHistory = sessionAttributes.conversationHistory || [];

      // Claude APIを呼び出し
      const response = await client.chat(query, conversationHistory);

      // 会話履歴を更新（最大10ターン = 20メッセージ）
      // cardにはフルコンテキストが含まれるのでそちらを保存
      conversationHistory.push({ role: 'user', content: query });
      conversationHistory.push({ role: 'assistant', content: response.card });

      if (conversationHistory.length > 20) {
        conversationHistory.splice(0, 2);
      }

      // 利用回数をインクリメント（無料ユーザーのみカウント）
      if (!entitled) {
        incrementUsage(sessionAttributes);
      }

      // セッション属性を保存
      sessionAttributes.conversationHistory = conversationHistory;
      sessionAttributes.currentModel = client.currentModel;
      sessionAttributes.currentPersona = client.currentPersona;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      // DynamoDBに保存（有効な場合）
      if (conversationStore) {
        const userId = getUserId(handlerInput);
        await conversationStore.saveConversation(
          userId,
          conversationHistory,
          client.currentPersona,
          client.currentModel
        );
      }

      // レスポンスを構築
      const responseBuilder = handlerInput.responseBuilder
        .speak(response.speech)
        .reprompt('他に質問はありますか？');

      // APL対応デバイスの場合、チャット画面を表示
      if (supportsAPL(handlerInput)) {
        responseBuilder.addDirective(createChatResponseDirective(
          query,
          response.card,
          '他に質問はありますか？'
        ));
      } else {
        responseBuilder.withSimpleCard('クロ先生', response.card);
      }

      return responseBuilder.getResponse();

    } catch (error) {
      console.error('Chat Error:', error);

      // エラー種別に応じたフォールバック
      let errorMessage = 'すみません、エラーが発生しました。もう一度お試しください。';

      if (error.status === 429) {
        errorMessage = 'リクエストが集中しています。少し待ってからもう一度お試しください。';
      } else if (error.status === 401) {
        errorMessage = 'APIの認証エラーが発生しました。設定を確認してください。';
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'タイムアウトしました。もう一度お試しください。';
      }

      return handlerInput.responseBuilder
        .speak(errorMessage)
        .reprompt('他に質問はありますか？')
        .getResponse();
    }
  }
};

/**
 * SwitchPersonaIntent Handler
 * ペルソナを切り替え（Phase 2機能）
 */
const SwitchPersonaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SwitchPersonaIntent';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const client = getClaudeClient(sessionAttributes);

    const persona = Alexa.getSlotValue(handlerInput.requestEnvelope, 'persona');

    if (persona) {
      client.switchPersona(persona);
      sessionAttributes.currentPersona = client.currentPersona;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      const personaName = client.getCurrentPersonaName();
      const speakOutput = `${personaName}モードに切り替えました。`;

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('何か質問はありますか？')
        .withSimpleCard('モード切替', speakOutput)
        .getResponse();
    }

    return handlerInput.responseBuilder
      .speak('ペルソナ名を指定してください。ギンさん、標準、丁寧、フレンドリーから選べます。')
      .reprompt('どのモードにしますか？')
      .getResponse();
  }
};

/**
 * SwitchModelIntent Handler
 * モデルを切り替え（Phase 2機能）
 */
const SwitchModelIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SwitchModelIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const client = getClaudeClient(sessionAttributes);

    const model = Alexa.getSlotValue(handlerInput.requestEnvelope, 'model');

    if (model) {
      // 課金状態を確認
      const { entitled } = await getSubscriptionStatus(handlerInput);

      const result = client.switchModel(model, entitled);

      if (!result.success && result.reason === 'premium_required') {
        // 無料ユーザーがSonnetを選択しようとした
        const speakOutput = 'Sonnetモデルはプレミアムプラン限定です。プレミアムプランに登録しますか？';
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt('プレミアムプランに登録しますか？')
          .withSimpleCard('モデル切替', 'Sonnetモデルはプレミアムプラン限定です。')
          .getResponse();
      }

      sessionAttributes.currentModel = client.currentModel;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      const modelName = client.getCurrentModelName();
      const speakOutput = `${modelName}モデルに切り替えました。`;

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('何か質問はありますか？')
        .withSimpleCard('モデル切替', speakOutput)
        .getResponse();
    }

    // 無料ユーザーにはSonnetの選択肢を見せない
    const { entitled } = await getSubscriptionStatus(handlerInput);
    const options = entitled
      ? 'ハイクまたはソネットから選べます。'
      : 'ハイクモデルをご利用いただけます。ソネットはプレミアムプラン限定です。';

    return handlerInput.responseBuilder
      .speak(`モデル名を指定してください。${options}`)
      .reprompt('どのモデルにしますか？')
      .getResponse();
  }
};

/**
 * ClearHistoryIntent Handler
 * 会話履歴をクリア
 */
const ClearHistoryIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ClearHistoryIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    // セッション属性をクリア
    sessionAttributes.conversationHistory = [];
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    // DynamoDBからも削除（有効な場合）
    if (conversationStore) {
      const userId = getUserId(handlerInput);
      await conversationStore.clearConversation(userId);
    }

    return handlerInput.responseBuilder
      .speak('会話履歴をクリアしました。新しい会話を始めましょう。')
      .reprompt('何か質問はありますか？')
      .withSimpleCard('履歴クリア', '会話履歴をクリアしました')
      .getResponse();
  }
};

/**
 * CreateReminder Intent Handler
 * リマインダー作成
 */
/**
 * CreateReminderIntent Handler
 * リマインダーを作成（時間と日付のみ受け取り、内容はデフォルト）
 * 注意: AMAZON.SearchQueryは他のスロットと併用不可のため、内容は固定
 */
const CreateReminderIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CreateReminderIntent';
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const reminderText = 'クロ先生からのリマインダー'; // 固定テキスト
    const reminderTime = slots?.reminderTime?.value;
    const reminderDate = slots?.reminderDate?.value;

    // 日時を構築
    let scheduledTime = new Date();
    if (reminderDate) {
      const dateParts = reminderDate.split('-');
      scheduledTime.setFullYear(parseInt(dateParts[0]));
      scheduledTime.setMonth(parseInt(dateParts[1]) - 1);
      scheduledTime.setDate(parseInt(dateParts[2]));
    }
    if (reminderTime) {
      const timeParts = reminderTime.split(':');
      scheduledTime.setHours(parseInt(timeParts[0]));
      scheduledTime.setMinutes(parseInt(timeParts[1]));
    }
    scheduledTime.setSeconds(0);

    // 過去の時刻なら翌日に
    if (scheduledTime <= new Date()) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    // リマインダーを作成
    const result = await createReminder(handlerInput, reminderText, scheduledTime);

    if (result.success) {
      return handlerInput.responseBuilder
        .speak(result.message)
        .reprompt('他に何かありますか？')
        .withSimpleCard('リマインダー設定', result.message)
        .getResponse();
    } else {
      // 権限が必要な場合
      if (result.error === 'permission_required' || result.error === 'permission_denied') {
        return handlerInput.responseBuilder
          .speak(result.message)
          .withAskForPermissionsConsentCard(['alexa::alerts:reminders:skill:readwrite'])
          .getResponse();
      }

      return handlerInput.responseBuilder
        .speak(result.message)
        .reprompt('他に何かありますか？')
        .getResponse();
    }
  }
};

/**
 * BuySubscription Intent Handler
 * プレミアム購入フロー開始
 */
const BuySubscriptionIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'BuySubscriptionIntent';
  },
  async handle(handlerInput) {
    const { entitled, product } = await getSubscriptionStatus(handlerInput);

    if (entitled) {
      return handlerInput.responseBuilder
        .speak('すでにプレミアムプランに登録されています。無制限でお使いいただけます。')
        .reprompt('何か質問はありますか？')
        .getResponse();
    }

    if (!product) {
      return handlerInput.responseBuilder
        .speak('申し訳ありません。プレミアムプランの情報を取得できませんでした。')
        .reprompt('何か質問はありますか？')
        .getResponse();
    }

    return handlerInput.responseBuilder
      .addDirective(getBuyDirective(product.productId))
      .getResponse();
  }
};

/**
 * CancelSubscription Intent Handler
 * プレミアム解約フロー開始
 */
const CancelSubscriptionIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CancelSubscriptionIntent';
  },
  async handle(handlerInput) {
    const { entitled, product } = await getSubscriptionStatus(handlerInput);

    if (!entitled) {
      return handlerInput.responseBuilder
        .speak('プレミアムプランに登録されていません。')
        .reprompt('何か質問はありますか？')
        .getResponse();
    }

    return handlerInput.responseBuilder
      .addDirective(getCancelDirective(product.productId))
      .getResponse();
  }
};

/**
 * CheckSubscription Intent Handler
 * サブスクリプション状態確認
 */
const CheckSubscriptionIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CheckSubscriptionIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const { entitled } = await getSubscriptionStatus(handlerInput);

    if (entitled) {
      return handlerInput.responseBuilder
        .speak('プレミアムプランに登録中です。無制限でお使いいただけます。')
        .reprompt('何か質問はありますか？')
        .getResponse();
    }

    const usageCount = getUsageCount(sessionAttributes);
    const remaining = Math.max(0, FREE_DAILY_LIMIT - usageCount);

    return handlerInput.responseBuilder
      .speak(`無料プランをご利用中です。本日の残り回数は${remaining}回です。プレミアムプランに登録すると無制限でお使いいただけます。`)
      .reprompt('プレミアムに登録しますか？')
      .getResponse();
  }
};

/**
 * Connections Response Handler
 * ISP購入/キャンセルフローからの戻り処理
 */
const ConnectionsResponseHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'Connections.Response';
  },
  handle(handlerInput) {
    const { payload, status } = handlerInput.requestEnvelope.request;
    const purchaseResult = payload.purchaseResult;

    console.log(`Connections.Response: status=${status.code}, result=${purchaseResult}`);

    let speakOutput;

    switch (purchaseResult) {
      case 'ACCEPTED':
        speakOutput = 'プレミアムプランへの登録ありがとうございます。これで無制限にClaudeと会話できます。何か質問はありますか？';
        break;
      case 'DECLINED':
        speakOutput = 'わかりました。無料プランで引き続きお使いいただけます。何か質問はありますか？';
        break;
      case 'ALREADY_PURCHASED':
        speakOutput = 'すでにプレミアムプランに登録されています。何か質問はありますか？';
        break;
      case 'NOT_ENTITLED':
        speakOutput = 'プレミアムプランが解約されました。無料プランで引き続きお使いいただけます。';
        break;
      default:
        speakOutput = '処理が完了しました。何か質問はありますか？';
    }

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('何か質問はありますか？')
      .getResponse();
  }
};

/**
 * Help Intent Handler
 */
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speakOutput = 'このスキルでは、Claudeと日本語で会話できます。' +
      '質問を自由に話しかけてください。' +
      `無料プランでは1日${FREE_DAILY_LIMIT}回まで、プレミアムプランでは無制限でお使いいただけます。` +
      '「プレミアムに登録」で購入、「残り回数」で確認できます。' +
      '終了するときは「おしまい」と言ってください。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('何か質問はありますか？')
      .withSimpleCard('ヘルプ', speakOutput)
      .getResponse();
  }
};

/**
 * Cancel and Stop Intent Handler
 */
const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speakOutput = 'また話しかけてくださいね。さようなら。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true)
      .getResponse();
  }
};

/**
 * Fallback Intent Handler
 */
const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  async handle(handlerInput) {
    console.log('=== FallbackIntent triggered ===');

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const client = getClaudeClient(sessionAttributes);
    const conversationHistory = sessionAttributes.conversationHistory || [];

    console.log('FallbackIntent - conversationHistory length:', conversationHistory.length);

    // 会話履歴がある場合は、前の会話の続きとして処理
    if (conversationHistory.length > 0) {
      console.log('FallbackIntent - Continuing conversation with context');

      // 直前のアシスタント応答を確認
      const lastAssistantMsg = conversationHistory
        .filter(m => m.role === 'assistant')
        .pop();

      try {
        // Progressive Response
        await sendProgressiveResponse(handlerInput, '考え中です...');

        // 直前の応答に質問が含まれている場合は、それに対する応答として処理
        const prompt = lastAssistantMsg && lastAssistantMsg.content.includes('？')
          ? 'ユーザーが何か返答しましたが聞き取れませんでした。前の質問をもう一度別の言い方で聞いてください。'
          : '前の会話を踏まえて、ユーザーが次に知りたそうなことを予測して、補足情報を提供してください。';

        const response = await client.chat(prompt, conversationHistory);

        // 会話履歴を更新
        conversationHistory.push({ role: 'user', content: '(聞き取れませんでした)' });
        conversationHistory.push({ role: 'assistant', content: response.card });

        if (conversationHistory.length > 20) {
          conversationHistory.splice(0, 2);
        }

        sessionAttributes.conversationHistory = conversationHistory;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
          .speak(response.speech)
          .reprompt('他に質問はありますか？')
          .withSimpleCard('クロード', response.card)
          .getResponse();
      } catch (error) {
        console.error('Fallback Chat Error:', error);
      }
    }

    console.log('FallbackIntent - Using static fallback response');
    const speakOutput = 'すみません、よく分かりませんでした。もう一度お願いします。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('何か質問はありますか？')
      .getResponse();
  }
};

/**
 * Session Ended Request Handler
 */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    const { reason } = handlerInput.requestEnvelope.request;
    console.log(`Session ended with reason: ${reason}`);
    return handlerInput.responseBuilder.getResponse();
  }
};

/**
 * Intent Reflector (デバッグ用)
 */
const IntentReflectorHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = `${intentName}は現在対応していません。`;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('何か質問はありますか？')
      .getResponse();
  }
};

/**
 * Error Handler
 */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error(`Error handled: ${error.message}`);
    console.error('Error stack:', error.stack);

    const speakOutput = 'すみません、エラーが発生しました。もう一度お試しください。';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('何か質問はありますか？')
      .getResponse();
  }
};

/**
 * Request Interceptor - リクエストのログ出力
 */
const LoggingRequestInterceptor = {
  process(handlerInput) {
    console.log(`Request Type: ${Alexa.getRequestType(handlerInput.requestEnvelope)}`);
    if (Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest') {
      console.log(`Intent Name: ${Alexa.getIntentName(handlerInput.requestEnvelope)}`);
    }
  }
};

/**
 * Response Interceptor - レスポンスのログ出力
 */
const LoggingResponseInterceptor = {
  process(handlerInput, response) {
    console.log(`Response: ${JSON.stringify(response)}`);
  }
};

/**
 * Skill Builder
 */
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    ConnectionsResponseHandler,  // ISP応答ハンドラー（優先度高）
    BuySubscriptionIntentHandler,
    CancelSubscriptionIntentHandler,
    CheckSubscriptionIntentHandler,
    CreateReminderIntentHandler,  // リマインダー作成
    ChatIntentHandler,
    SwitchPersonaIntentHandler,
    SwitchModelIntentHandler,
    ClearHistoryIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler  // 最後に配置（フォールバック用）
  )
  .addErrorHandlers(ErrorHandler)
  .addRequestInterceptors(LoggingRequestInterceptor)
  .addResponseInterceptors(LoggingResponseInterceptor)
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
