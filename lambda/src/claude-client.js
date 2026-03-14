/**
 * Claude API Client Module
 * Anthropic Claude APIとの通信を担当するモジュール
 */

const Anthropic = require('@anthropic-ai/sdk');

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

【重要】必ず以下の形式のみで応答してください。他のテキストは一切含めないでください:
{"speech":"音声用テキスト", "card":"カード用テキスト"}`,

  ginsan: `あなたは「銀次」という名前のAIアシスタントです。OpenClawプロジェクトの「銀次の作戦室」で活躍しています。
音声で読み上げられることを前提に、以下のルールを守ってください:
- 応答は50字以内で簡潔にまとめる
- カジュアルで親しみやすい口調で話す
- 時々「〜だな」「〜だぜ」などの語尾を使う
- マークダウンや特殊文字は使わない

【重要】必ず以下の形式のみで応答してください。他のテキストは一切含めないでください:
{"speech":"音声用テキスト", "card":"カード用テキスト"}`,

  polite: `あなたはAlexaデバイス上で動作する丁寧な日本語AIアシスタントです。
音声で読み上げられることを前提に、以下のルールを守ってください:
- 応答は50字以内で簡潔にまとめる
- 敬語を使い、丁寧に応答する
- マークダウンや特殊文字は使わない

【重要】必ず以下の形式のみで応答してください。他のテキストは一切含めないでください:
{"speech":"音声用テキスト", "card":"カード用テキスト"}`,

  friendly: `あなたはAlexaデバイス上で動作する友達のようなAIアシスタントです。
音声で読み上げられることを前提に、以下のルールを守ってください:
- 応答は50字以内で簡潔にまとめる
- 友達に話すようなカジュアルな口調で話す
- マークダウンや特殊文字は使わない

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

class ClaudeClient {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
    this.currentModel = MODELS.HAIKU;
    this.currentPersona = 'default';
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
   * @returns {string} 切り替え後のモデルID
   */
  switchModel(modelName) {
    const normalizedName = MODEL_MAP[modelName] || 'HAIKU';
    this.currentModel = MODELS[normalizedName];
    return this.currentModel;
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
    const systemPrompt = PERSONAS[this.currentPersona] || PERSONAS.default;

    // 会話履歴を構築（最大10ターン）
    const messages = conversationHistory.slice(-20).map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 新しいユーザーメッセージを追加
    messages.push({
      role: 'user',
      content: userMessage
    });

    try {
      const response = await this.client.messages.create({
        model: this.currentModel,
        max_tokens: 300,
        temperature: 0.7,
        system: systemPrompt,
        messages: messages
      });

      const responseText = response.content[0].text;

      // JSON形式のレスポンスをパース
      return this.parseResponse(responseText);
    } catch (error) {
      console.error('Claude API Error:', error);
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
  MODEL_MAP
};
