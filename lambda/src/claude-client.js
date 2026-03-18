/**
 * Claude API Client Module
 * Anthropic Claude APIとの通信を担当するモジュール
 */

const Anthropic = require('@anthropic-ai/sdk');
const { WebSearchClient } = require('./web-search');

// Web検索ツール定義
const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: `Web検索を実行してファクトチェックします。

【原則】具体的な事実を回答する前に、必ず検索してください。記憶だけで回答すると誤情報のリスクがあります。

【必須で検索するケース】
- 映画・ドラマ・アニメの情報（出演者、監督、あらすじ、公開日）
- 人物情報（経歴、出演作品、所属、年齢）
- 製品・サービスの情報（価格、発売日、スペック）
- 店舗・施設の情報（営業時間、場所、スケジュール）
- イベント・ニュース・スポーツなどリアルタイム情報
- 天気、株価など変動する情報
- 「おすすめ」「ランキング」「最新」に関する質問
- 地名、料理、歴史、科学など事実確認が必要な質問

【重要ルール】
- 自分の知識だけで回答しない。必ず検索で裏付けを取る
- 「多分」「おそらく」で済ませず、検索して確認する
- 似た名前の人物・作品と混同するリスクがあるので検索必須
- 迷ったら検索。誤情報を伝えるより検索した方が100倍良い`,
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '検索クエリ（日本語）。会話の文脈を含めて具体的に検索する。例: 「プロジェクトヘイルメアリー 映画 浦和パルコ 上映」'
      }
    },
    required: ['query']
  }
};

// モデル定義
const MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-5-20250929'
};

// ペルソナ別システムプロンプト
const PERSONAS = {
  default: `あなたはAlexaデバイス上で動作する日本語のAIアシスタントです。
音声で読み上げられることを前提に、以下のルールを守ってください:
- 応答は50字以内で簡潔にまとめる
- 詳細な説明が必要な場合は、要約を音声で返し、詳細は「card」フィールドで返す
- マークダウンや特殊文字は使わない
- 自然な話し言葉で応答する

【会話の文脈理解】
- ユーザーの最新の発話を最優先で処理する
- 最新の発話が前の話題と無関係なら、前の話題は完全に忘れて新しい質問に答える
- 最新の発話が前の質問への回答なら、その情報を使って処理を進める
- 例: 天気の話をしていても「映画について教えて」と言われたら映画について答える

【重要】必ず以下の形式のみで応答してください。他のテキストは一切含めないでください:
{"speech":"音声用テキスト", "card":"カード用テキスト"}`,

  ginsan: `あなたは「銀次」という名前のAIアシスタントです。OpenClawプロジェクトの「銀次の作戦室」で活躍しています。
音声で読み上げられることを前提に、以下のルールを守ってください:
- 応答は50字以内で簡潔にまとめる
- カジュアルで親しみやすい口調で話す
- 時々「〜だな」「〜だぜ」などの語尾を使う
- マークダウンや特殊文字は使わない

【会話の文脈理解】
- ユーザーの最新の発話を最優先で処理する
- 最新の発話が前の話題と無関係なら、前の話題は完全に忘れて新しい質問に答える
- 最新の発話が前の質問への回答なら、その情報を使って処理を進める

【重要】必ず以下の形式のみで応答してください。他のテキストは一切含めないでください:
{"speech":"音声用テキスト", "card":"カード用テキスト"}`,

  polite: `あなたはAlexaデバイス上で動作する丁寧な日本語AIアシスタントです。
音声で読み上げられることを前提に、以下のルールを守ってください:
- 応答は50字以内で簡潔にまとめる
- 敬語を使い、丁寧に応答する
- マークダウンや特殊文字は使わない

【会話の文脈理解】
- ユーザーの最新の発話を最優先で処理する
- 最新の発話が前の話題と無関係なら、前の話題は完全に忘れて新しい質問に答える
- 最新の発話が前の質問への回答なら、その情報を使って処理を進める

【重要】必ず以下の形式のみで応答してください。他のテキストは一切含めないでください:
{"speech":"音声用テキスト", "card":"カード用テキスト"}`,

  friendly: `あなたはAlexaデバイス上で動作する友達のようなAIアシスタントです。
音声で読み上げられることを前提に、以下のルールを守ってください:
- 応答は50字以内で簡潔にまとめる
- 友達に話すようなカジュアルな口調で話す
- マークダウンや特殊文字は使わない

【会話の文脈理解】
- ユーザーの最新の発話を最優先で処理する
- 最新の発話が前の話題と無関係なら、前の話題は完全に忘れて新しい質問に答える
- 最新の発話が前の質問への回答なら、その情報を使って処理を進める

【重要】必ず以下の形式のみで応答してください。他のテキストは一切含めないでください:
{"speech":"音声用テキスト", "card":"カード用テキスト"}`
};

// ペルソナ名の正規化
const PERSONA_MAP = {
  'ギンさん': 'ginsan',
  '銀さん': 'ginsan',
  'ぎんさん': 'ginsan',
  '銀次': 'ginsan',
  'ギンジ': 'ginsan',
  '標準': 'default',
  'ノーマル': 'default',
  '普通': 'default',
  'デフォルト': 'default',
  '丁寧': 'polite',
  '敬語': 'polite',
  'フォーマル': 'polite',
  'フレンドリー': 'friendly',
  '友達': 'friendly',
  'カジュアル': 'friendly'
};

// モデル名の正規化
const MODEL_MAP = {
  'ハイク': 'HAIKU',
  'Haiku': 'HAIKU',
  'はいく': 'HAIKU',
  'ソネット': 'SONNET',
  'Sonnet': 'SONNET',
  'そねっと': 'SONNET'
};

/**
 * 会話履歴から現在のトピックを抽出
 * @param {Array} conversationHistory - 会話履歴
 * @returns {string|null} 抽出されたトピック
 */
function extractConversationTopic(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) {
    return null;
  }

  // 直近の会話から主要なキーワードを抽出
  const recentHistory = conversationHistory.slice(-4); // 直近2ターン
  const topics = [];

  for (const msg of recentHistory) {
    const content = msg.content || '';

    // 映画、本、イベントなどの固有名詞を検出
    const patterns = [
      /「([^」]+)」/g,  // 「」で囲まれた名詞
      /『([^』]+)』/g,  // 『』で囲まれた名詞
      /(プロジェクト[・\s]?ヘイル[・\s]?メアリー)/gi,
      /(\S+(?:映画|ドラマ|アニメ|本|小説|ゲーム|イベント|ライブ|コンサート))/g,
    ];

    for (const pattern of patterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        topics.push(match[1] || match[0]);
      }
    }
  }

  return topics.length > 0 ? topics[topics.length - 1] : null;
}

/**
 * ユーザーメッセージが曖昧かどうかを判定
 * @param {string} message - ユーザーメッセージ
 * @returns {boolean}
 */
function isAmbiguousMessage(message) {
  // 主語がない短いメッセージは曖昧
  if (message.length < 15) {
    // 「それ」「これ」「あれ」「どこ」「いつ」などで始まる
    const ambiguousPatterns = [
      /^(それ|これ|あれ|どこ|いつ|どう|何時|どの)/,
      /^.{0,5}(で|は|を|に|が)(上映|公開|発売|開催|やる|ある|できる|見れる)/,
      /(かな|だっけ|でしょ|ですか)$/,
    ];
    return ambiguousPatterns.some(p => p.test(message));
  }
  return false;
}

/**
 * 新しいメッセージが現在のトピックと関連があるかを判定（ルールベース・フォールバック用）
 * @param {string} message - ユーザーメッセージ
 * @param {string|null} currentTopic - 現在のトピック
 * @returns {boolean} 関連がある場合はtrue
 */
function isRelatedToTopicRuleBased(message, currentTopic) {
  if (!currentTopic) return false;

  // 曖昧なメッセージは関連ありとみなす
  if (isAmbiguousMessage(message)) return true;

  // 継続を示す表現があれば関連ありとみなす
  const continuationPatterns = [
    /^(他に|それ以外|もっと|さらに|ほかに|別の|もう少し|もうちょっと)/,
    /^(その|この|あの|それ|これ|あれ)/,
    /(も教えて|も知りたい|もある|もいる|はどう|はいますか|はありますか|についても)$/,
    /(他には|以外に|それから|あとは|ついでに)/,
    /^(じゃあ|では|なら|だったら)/,
    /^.{0,5}(は|も|って|の)(どう|なに|だれ|いつ|どこ)/,
    /(詳しく|具体的に|例えば|つまり|要するに)/,
    /^(なぜ|どうして|どういう|どんな)/,
  ];
  if (continuationPatterns.some(p => p.test(message))) {
    return true;
  }

  // トピック自体が含まれていれば関連あり
  if (message.includes(currentTopic)) return true;

  // トピックのキーワードが含まれているかチェック
  const topicKeywords = currentTopic.split(/[\s・、。]+/).filter(w => w.length >= 2);
  for (const keyword of topicKeywords) {
    if (message.includes(keyword)) return true;
  }

  return false;
}

/**
 * 文脈を使ってユーザーメッセージを補完
 * @param {string} message - 元のメッセージ
 * @param {string|null} topic - 会話トピック
 * @returns {string} 補完されたメッセージ
 */
function augmentMessageWithContext(message, topic) {
  if (!topic) return message;

  // すでにトピックが含まれている場合は補完不要
  if (message.includes(topic)) return message;

  // 曖昧なメッセージの場合、文脈を追加
  if (isAmbiguousMessage(message)) {
    return `【会話の文脈: ${topic}について話しています】\n${message}`;
  }

  return message;
}

class ClaudeClient {
  constructor(apiKey, webSearchApiKey = null) {
    this.client = new Anthropic({ apiKey });
    this.currentModel = MODELS.HAIKU;
    this.currentPersona = 'default';
    this.webSearchClient = webSearchApiKey ? new WebSearchClient(webSearchApiKey) : null;
    this.toolsEnabled = !!webSearchApiKey;
    this.currentTopic = null; // 現在の会話トピック
    this.lastPartialResponse = null; // タイムアウトで途切れた応答
    this.wasInterrupted = false; // 前回の応答が途中で切れたか
  }

  /**
   * ユーザーが「続き」を求めているかを判定
   * @param {string} message - ユーザーメッセージ
   * @returns {boolean}
   */
  isAskingForContinuation(message) {
    const continuationRequests = [
      /^続き/,
      /^つづき/,
      /続きを?(教えて|聞かせて|お願い)/,
      /^続けて/,
      /^つづけて/,
      /^その続き/,
      /^それから[?？]?$/,
      /^で[?？]?$/,
    ];
    return continuationRequests.some(p => p.test(message));
  }

  /**
   * ストリーミングでレスポンスを取得（タイムアウト対応）
   * @param {string} systemPrompt - システムプロンプト
   * @param {Array} messages - メッセージ配列
   * @param {number} timeoutMs - タイムアウト（ミリ秒）
   * @returns {Promise<string>} レスポンステキスト
   */
  async streamWithTimeout(systemPrompt, messages, timeoutMs = 6500) {
    const startTime = Date.now();
    let responseText = '';
    let timedOut = false;

    try {
      const stream = this.client.messages.stream({
        model: this.currentModel,
        max_tokens: 300,
        temperature: 0.7,
        system: systemPrompt,
        messages: messages
      });

      for await (const event of stream) {
        // タイムアウトチェック
        if (Date.now() - startTime > timeoutMs) {
          console.log(`Streaming timeout after ${timeoutMs}ms, returning partial response`);
          timedOut = true;
          break;
        }

        // テキストチャンクを収集
        if (event.type === 'content_block_delta' && event.delta?.text) {
          responseText += event.delta.text;
        }
      }

      // タイムアウトした場合、途中の応答を保存
      if (timedOut && responseText.length > 0) {
        this.wasInterrupted = true;
        this.lastPartialResponse = responseText;
        // ユーザーに続きを促すメッセージを追加
        responseText += '...「続き」と言っていただければ、続きをお話しします。';
      } else {
        // 正常完了の場合はフラグをリセット
        this.wasInterrupted = false;
        this.lastPartialResponse = null;
      }

      return responseText || '申し訳ありません。回答を生成できませんでした。';
    } catch (error) {
      console.error('Streaming error:', error);
      throw error;
    }
  }

  /**
   * 会話の継続かどうかを判定（ルールベース、高速）
   * @param {string} newMessage - 新しいユーザーメッセージ
   * @param {Array} conversationHistory - 会話履歴
   * @returns {boolean} 継続の場合はtrue、新しい話題の場合はfalse
   */
  isTopicContinuation(newMessage, conversationHistory) {
    // 会話履歴がない場合は新しい話題ではない（最初の発話）
    if (!conversationHistory || conversationHistory.length === 0) {
      return false;
    }

    // 会話履歴からトピックを抽出
    const historyTopic = extractConversationTopic(conversationHistory);

    // ルールベースで判定
    return isRelatedToTopicRuleBased(newMessage, historyTopic);
  }

  /**
   * ペルソナを切り替える
   * @param {string} personaName - ペルソナ名
   * @returns {string} 切り替え後のペルソナ名
   */
  switchPersona(personaName) {
    const normalizedName = PERSONA_MAP[personaName] || 'default';
    this.currentPersona = normalizedName;
    return normalizedName;
  }

  /**
   * モデルを切り替える
   * @param {string} modelName - モデル名
   * @param {boolean} isPremium - プレミアムユーザーかどうか
   * @returns {{success: boolean, model: string, reason?: string}} 切り替え結果
   */
  switchModel(modelName, isPremium = false) {
    const normalizedName = MODEL_MAP[modelName] || 'HAIKU';

    // 無料ユーザーがSonnetを選択しようとした場合は拒否
    if (normalizedName === 'SONNET' && !isPremium) {
      return {
        success: false,
        model: 'SONNET',
        reason: 'premium_required'
      };
    }

    this.currentModel = MODELS[normalizedName];
    return {
      success: true,
      model: this.currentModel
    };
  }

  /**
   * 現在のモデル名を取得（表示用）
   * @returns {string}
   */
  getCurrentModelName() {
    return this.currentModel === MODELS.HAIKU ? 'Haiku' : 'Sonnet';
  }

  /**
   * 現在のペルソナ名を取得（表示用）
   * @returns {string}
   */
  getCurrentPersonaName() {
    const names = {
      default: '標準',
      ginsan: 'ギンさん',
      polite: '丁寧',
      friendly: 'フレンドリー'
    };
    return names[this.currentPersona] || '標準';
  }

  /**
   * Claude APIにメッセージを送信し応答を取得
   * @param {string} userMessage - ユーザーのメッセージ
   * @param {Array} conversationHistory - 会話履歴
   * @returns {Promise<{speech: string, card: string}>}
   */
  async chat(userMessage, conversationHistory = []) {
    // 「続き」リクエストの処理
    if (this.isAskingForContinuation(userMessage) && this.wasInterrupted && this.lastPartialResponse) {
      console.log('Continuation requested, generating rest of response');
      return this.generateContinuation(conversationHistory);
    }

    // ツールが有効な場合はchatWithToolsを使用
    if (this.toolsEnabled) {
      return this.chatWithTools(userMessage, conversationHistory);
    }

    const basePrompt = PERSONAS[this.currentPersona] || PERSONAS.default;
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    // LLMを使って会話の継続かどうかを判定
    const isContinuation = this.isTopicContinuation(userMessage, conversationHistory);
    const historyTopic = extractConversationTopic(conversationHistory);

    if (!isContinuation && conversationHistory.length > 0) {
      console.log(`New topic detected by LLM (new message: "${userMessage}")`);
      this.currentTopic = null;
    } else if (historyTopic) {
      this.currentTopic = historyTopic;
    }

    // トピック情報をシステムプロンプトに追加（継続の場合のみ）
    let systemPrompt = `現在の日付: ${today}\n\n`;
    if (this.currentTopic && isContinuation) {
      systemPrompt += `【現在の会話トピック】${this.currentTopic}\n\n`;
    }
    systemPrompt += basePrompt;

    // 新しい話題の場合は会話履歴を使わない
    let messages;
    if (!isContinuation && conversationHistory.length > 0) {
      console.log('New topic: clearing conversation history');
      messages = [];
    } else {
      messages = conversationHistory.slice(-20).map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }

    // 曖昧なメッセージを文脈で補完（継続の場合のみ）
    const augmentedMessage = isContinuation
      ? augmentMessageWithContext(userMessage, this.currentTopic)
      : userMessage;

    console.log('Original message:', userMessage);
    console.log('Is continuation:', isContinuation);
    console.log('Current topic:', this.currentTopic || 'none');

    // 新しいユーザーメッセージを追加
    messages.push({
      role: 'user',
      content: augmentedMessage
    });

    try {
      // ストリーミングでレスポンスを取得（タイムアウト対応）
      const responseText = await this.streamWithTimeout(systemPrompt, messages, 6500);

      // JSON形式のレスポンスをパース
      return this.parseResponse(responseText);
    } catch (error) {
      console.error('Claude API Error:', error);
      throw error;
    }
  }

  /**
   * ツール使用対応のChat
   * @param {string} userMessage - ユーザーのメッセージ
   * @param {Array} conversationHistory - 会話履歴
   * @returns {Promise<{speech: string, card: string}>}
   */
  async chatWithTools(userMessage, conversationHistory = []) {
    const basePrompt = PERSONAS[this.currentPersona] || PERSONAS.default;
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    // LLMを使って会話の継続かどうかを判定
    const isContinuation = this.isTopicContinuation(userMessage, conversationHistory);
    const historyTopic = extractConversationTopic(conversationHistory);

    if (!isContinuation && conversationHistory.length > 0) {
      console.log(`New topic detected by LLM (new message: "${userMessage}")`);
      this.currentTopic = null;
    } else if (historyTopic) {
      this.currentTopic = historyTopic;
    }

    // トピック情報をシステムプロンプトに追加（継続の場合のみ）
    let systemPrompt = `現在の日付: ${today}\n\n`;
    if (this.currentTopic && isContinuation) {
      systemPrompt += `【現在の会話トピック】${this.currentTopic}\n\n`;
    }
    systemPrompt += basePrompt;

    // 新しい話題の場合は会話履歴を使わない
    let messages;
    if (!isContinuation && conversationHistory.length > 0) {
      console.log('New topic: clearing conversation history');
      messages = [];
    } else {
      messages = conversationHistory.slice(-20).map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    }

    // 曖昧なメッセージを文脈で補完（継続の場合のみ）
    const augmentedMessage = isContinuation
      ? augmentMessageWithContext(userMessage, this.currentTopic)
      : userMessage;
    console.log('Original message:', userMessage);
    console.log('Is continuation:', isContinuation);
    console.log('Current topic:', this.currentTopic || 'none');

    messages.push({
      role: 'user',
      content: augmentedMessage
    });

    try {
      // 最初のAPI呼び出し（ツール使用判断）
      let response = await this.client.messages.create({
        model: this.currentModel,
        max_tokens: 500,
        temperature: 0.7,
        system: systemPrompt,
        messages: messages,
        tools: [WEB_SEARCH_TOOL]
      });

      // ツール使用が必要な場合
      if (response.stop_reason === 'tool_use') {
        const toolUse = response.content.find(c => c.type === 'tool_use');

        if (toolUse && toolUse.name === 'web_search') {
          console.log('Web検索実行:', toolUse.input.query);

          // Web検索を実行
          let searchResults;
          try {
            const results = await this.webSearchClient.search(toolUse.input.query, 3);
            searchResults = this.webSearchClient.formatResults(results);
          } catch (searchError) {
            console.error('Web検索エラー:', searchError);
            searchResults = '検索中にエラーが発生しました。';
          }

          // 検索結果を含めて再度API呼び出し
          messages.push({
            role: 'assistant',
            content: response.content
          });

          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: searchResults
            }]
          });

          // ストリーミングでレスポンスを取得（タイムアウト対応）
          const streamResponse = await this.streamWithTimeout(systemPrompt, messages, 6500);
          return this.parseResponse(streamResponse);
        }
      }

      // テキストレスポンスを取得
      const textContent = response.content.find(c => c.type === 'text');
      const responseText = textContent?.text || '';

      return this.parseResponse(responseText);
    } catch (error) {
      console.error('Claude API Error:', error);
      throw error;
    }
  }

  /**
   * 途中で切れた応答の続きを生成
   * @param {Array} conversationHistory - 会話履歴
   * @returns {Promise<{speech: string, card: string}>}
   */
  async generateContinuation(conversationHistory = []) {
    const basePrompt = PERSONAS[this.currentPersona] || PERSONAS.default;
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    let systemPrompt = `現在の日付: ${today}\n\n`;
    if (this.currentTopic) {
      systemPrompt += `【現在の会話トピック】${this.currentTopic}\n\n`;
    }
    systemPrompt += basePrompt;

    // 会話履歴を構築
    const messages = conversationHistory.slice(-20).map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 前回の途中応答をアシスタントの発言として追加
    messages.push({
      role: 'assistant',
      content: this.lastPartialResponse
    });

    // 続きを求めるメッセージを追加
    messages.push({
      role: 'user',
      content: '続きをお願いします。前の応答の続きから話してください。'
    });

    try {
      const responseText = await this.streamWithTimeout(systemPrompt, messages, 6500);

      // 続きを生成できた場合、前回の応答と結合してカードに表示
      const parsed = this.parseResponse(responseText);
      return {
        speech: parsed.speech,
        card: `【前回の続き】\n${this.lastPartialResponse}\n\n${parsed.card}`
      };
    } catch (error) {
      console.error('Continuation error:', error);
      throw error;
    }
  }

  /**
   * Claudeのレスポンスをパースする
   * @param {string} responseText - Claudeからのレスポンステキスト
   * @returns {{speech: string, card: string}}
   */
  parseResponse(responseText) {
    try {
      // JSONを抽出（プレフィックスがある場合に対応）
      let jsonText = responseText;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      // JSON形式でパースを試みる
      const parsed = JSON.parse(jsonText);
      return {
        speech: this.sanitizeSpeech(parsed.speech || responseText),
        card: parsed.card || parsed.speech || responseText
      };
    } catch {
      // JSONパースに失敗した場合はプレーンテキストとして処理
      const sanitized = this.sanitizeSpeech(responseText);
      return {
        speech: sanitized,
        card: responseText
      };
    }
  }

  /**
   * 音声応答用にテキストをサニタイズ
   * @param {string} text - 元のテキスト
   * @returns {string}
   */
  sanitizeSpeech(text) {
    let sanitized = text
      // マークダウン記法を除去
      .replace(/[*_`#]/g, '')
      // URLを除去
      .replace(/https?:\/\/\S+/g, '')
      // 改行を句点に変換
      .replace(/\n+/g, '。')
      // 連続する句点を整理
      .replace(/。+/g, '。')
      .trim();

    // 150文字を超える場合は切り詰め
    if (sanitized.length > 150) {
      sanitized = sanitized.substring(0, 147) + '...詳しくはAlexaアプリをご覧ください';
    }

    return sanitized;
  }
}

module.exports = {
  ClaudeClient,
  MODELS,
  PERSONAS,
  PERSONA_MAP,
  MODEL_MAP,
  WEB_SEARCH_TOOL
};
