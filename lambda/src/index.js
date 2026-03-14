/**
 * Alexa-Claude Voice Connector
 * AWS Lambda Handler for Alexa Custom Skill
 */

const Alexa = require('ask-sdk-core');
const { ClaudeClient } = require('./claude-client');

// 環境変数からAPIキーを取得
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ClaudeClientインスタンス（リクエストごとに状態をリストアする）
let claudeClient = null;

/**
 * ClaudeClientを取得または初期化
 */
function getClaudeClient(sessionAttributes) {
  if (!claudeClient) {
    claudeClient = new ClaudeClient(ANTHROPIC_API_KEY);
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
  handle(handlerInput) {
    const speakOutput = 'こんにちは。クロードです。何でも聞いてください。';

    // セッション属性を初期化
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.conversationHistory = [];
    sessionAttributes.currentModel = null;
    sessionAttributes.currentPersona = 'default';
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('何か質問はありますか？')
      .withSimpleCard('クロード', speakOutput)
      .getResponse();
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

    // Progressive Responseを送信（考え中...）
    await sendProgressiveResponse(handlerInput, '考え中です...');

    try {
      // 会話履歴を取得
      const conversationHistory = sessionAttributes.conversationHistory || [];

      // Claude APIを呼び出し
      const response = await client.chat(query, conversationHistory);

      // 会話履歴を更新（最大10ターン = 20メッセージ）
      conversationHistory.push({ role: 'user', content: query });
      conversationHistory.push({ role: 'assistant', content: response.speech });

      if (conversationHistory.length > 20) {
        conversationHistory.splice(0, 2);
      }

      // セッション属性を保存
      sessionAttributes.conversationHistory = conversationHistory;
      sessionAttributes.currentModel = client.currentModel;
      sessionAttributes.currentPersona = client.currentPersona;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(response.speech)
        .reprompt('他に質問はありますか？')
        .withSimpleCard('クロード', response.card)
        .getResponse();

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
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const client = getClaudeClient(sessionAttributes);

    const model = Alexa.getSlotValue(handlerInput.requestEnvelope, 'model');

    if (model) {
      client.switchModel(model);
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

    return handlerInput.responseBuilder
      .speak('モデル名を指定してください。ハイクまたはソネットから選べます。')
      .reprompt('どのモデルにしますか？')
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
  handle(handlerInput) {
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
    ChatIntentHandler,
    SwitchPersonaIntentHandler,
    SwitchModelIntentHandler,
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
