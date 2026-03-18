/**
 * Persistence Module
 * DynamoDBを使用した会話履歴の永続化
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'AlexaClaudeConversations';
const TTL_DAYS = 7; // 会話履歴の保持期間

class ConversationStore {
  constructor() {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
    this.docClient = DynamoDBDocumentClient.from(client);
  }

  /**
   * ユーザーの会話履歴を取得
   * @param {string} userId - AlexaユーザーID
   * @returns {Promise<{conversationHistory: Array, currentPersona: string, currentModel: string}>}
   */
  async getConversation(userId) {
    try {
      const response = await this.docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId }
      }));

      if (response.Item) {
        return {
          conversationHistory: response.Item.conversationHistory || [],
          currentPersona: response.Item.currentPersona || 'default',
          currentModel: response.Item.currentModel || null
        };
      }

      return {
        conversationHistory: [],
        currentPersona: 'default',
        currentModel: null
      };
    } catch (error) {
      console.error('DynamoDB Get Error:', error);
      // エラー時は空の状態を返す
      return {
        conversationHistory: [],
        currentPersona: 'default',
        currentModel: null
      };
    }
  }

  /**
   * ユーザーの会話履歴を保存
   * @param {string} userId - AlexaユーザーID
   * @param {Array} conversationHistory - 会話履歴
   * @param {string} currentPersona - 現在のペルソナ
   * @param {string} currentModel - 現在のモデル
   */
  async saveConversation(userId, conversationHistory, currentPersona, currentModel) {
    const ttl = Math.floor(Date.now() / 1000) + (TTL_DAYS * 24 * 60 * 60);

    try {
      await this.docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          userId,
          conversationHistory,
          currentPersona,
          currentModel,
          updatedAt: new Date().toISOString(),
          ttl
        }
      }));
    } catch (error) {
      console.error('DynamoDB Put Error:', error);
      // エラーは無視（セッション属性でフォールバック可能）
    }
  }

  /**
   * ユーザーの会話履歴を削除
   * @param {string} userId - AlexaユーザーID
   */
  async clearConversation(userId) {
    try {
      await this.docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { userId }
      }));
    } catch (error) {
      console.error('DynamoDB Delete Error:', error);
    }
  }
}

module.exports = { ConversationStore };
