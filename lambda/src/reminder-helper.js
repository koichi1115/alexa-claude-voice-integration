/**
 * Reminder Helper
 * Alexa Reminders APIとの連携を提供
 */

/**
 * リマインダーを作成
 * @param {object} handlerInput - Alexa handler input
 * @param {string} text - リマインダーテキスト
 * @param {Date} scheduledTime - リマインダー時刻
 * @returns {Promise<object>} 作成結果
 */
async function createReminder(handlerInput, text, scheduledTime) {
  const { serviceClientFactory, requestEnvelope } = handlerInput;

  // 権限チェック
  const consentToken = requestEnvelope.context.System.apiAccessToken;
  if (!consentToken) {
    return {
      success: false,
      error: 'permission_required',
      message: 'リマインダーの作成には権限が必要です。Alexaアプリで権限を許可してください。'
    };
  }

  try {
    const reminderClient = serviceClientFactory.getReminderManagementServiceClient();

    // タイムゾーン取得
    const timezone = 'Asia/Tokyo';

    // リマインダーリクエストを作成
    const reminderRequest = {
      requestTime: new Date().toISOString(),
      trigger: {
        type: 'SCHEDULED_ABSOLUTE',
        scheduledTime: scheduledTime.toISOString(),
        timeZoneId: timezone
      },
      alertInfo: {
        spokenInfo: {
          content: [{
            locale: 'ja-JP',
            text: text
          }]
        }
      },
      pushNotification: {
        status: 'ENABLED'
      }
    };

    const result = await reminderClient.createReminder(reminderRequest);

    return {
      success: true,
      reminderId: result.alertToken,
      message: `リマインダーを設定しました。${formatDateTime(scheduledTime)}にお知らせします。`
    };
  } catch (error) {
    console.error('Reminder creation error:', error);

    if (error.statusCode === 401 || error.statusCode === 403) {
      return {
        success: false,
        error: 'permission_denied',
        message: 'リマインダーの権限がありません。Alexaアプリで「クロ先生」の権限設定を確認してください。'
      };
    }

    return {
      success: false,
      error: 'unknown',
      message: 'リマインダーの作成に失敗しました。'
    };
  }
}

/**
 * 日時をフォーマット
 * @param {Date} date - 日時
 * @returns {string}
 */
function formatDateTime(date) {
  const options = {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo'
  };
  return date.toLocaleString('ja-JP', options);
}

/**
 * 自然言語から日時を解析
 * Claudeの応答からリマインダー設定を抽出
 * @param {string} text - 解析するテキスト（例: "明日の朝9時"、"3時間後"）
 * @returns {Date|null}
 */
function parseDateTime(text) {
  const now = new Date();
  const tokyo = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

  // 「X分後」「X時間後」
  const relativeMatch = text.match(/(\d+)(分|時間)後/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];
    const result = new Date(tokyo);
    if (unit === '分') {
      result.setMinutes(result.getMinutes() + amount);
    } else if (unit === '時間') {
      result.setHours(result.getHours() + amount);
    }
    return result;
  }

  // 「明日」「あさって」
  let dayOffset = 0;
  if (text.includes('明日')) {
    dayOffset = 1;
  } else if (text.includes('あさって') || text.includes('明後日')) {
    dayOffset = 2;
  }

  // 時刻を抽出
  const timeMatch = text.match(/(\d{1,2})時(?:(\d{1,2})分)?/);
  if (timeMatch) {
    const result = new Date(tokyo);
    result.setDate(result.getDate() + dayOffset);
    result.setHours(parseInt(timeMatch[1]));
    result.setMinutes(timeMatch[2] ? parseInt(timeMatch[2]) : 0);
    result.setSeconds(0);
    result.setMilliseconds(0);

    // 過去の時刻なら翌日に
    if (result <= tokyo && dayOffset === 0) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // 「朝」「昼」「夜」
  const periodMatch = text.match(/(朝|昼|夕方|夜)/);
  if (periodMatch) {
    const result = new Date(tokyo);
    result.setDate(result.getDate() + dayOffset);
    result.setMinutes(0);
    result.setSeconds(0);

    switch (periodMatch[1]) {
      case '朝':
        result.setHours(8);
        break;
      case '昼':
        result.setHours(12);
        break;
      case '夕方':
        result.setHours(17);
        break;
      case '夜':
        result.setHours(20);
        break;
    }
    return result;
  }

  return null;
}

/**
 * リマインダー設定リクエストを検出
 * @param {string} message - ユーザーメッセージ
 * @returns {boolean}
 */
function isReminderRequest(message) {
  const reminderPatterns = [
    /リマインダー/,
    /リマインド/,
    /通知して/,
    /教えて.*(後|時)/,
    /思い出させて/,
    /忘れない(よう|ため)/
  ];
  return reminderPatterns.some(p => p.test(message));
}

/**
 * リマインダー内容と日時を抽出
 * @param {string} message - ユーザーメッセージ
 * @returns {{content: string, datetime: Date}|null}
 */
function extractReminderInfo(message) {
  // 日時を解析
  const datetime = parseDateTime(message);
  if (!datetime) {
    return null;
  }

  // リマインダー内容を抽出（日時部分を除去）
  let content = message
    .replace(/(\d{1,2})時(?:(\d{1,2})分)?/g, '')
    .replace(/(明日|あさって|明後日)/g, '')
    .replace(/(朝|昼|夕方|夜)/g, '')
    .replace(/(\d+)(分|時間)後/g, '')
    .replace(/(リマインダー|リマインド|通知|教えて|思い出させて)/g, '')
    .replace(/[にをでの]/g, '')
    .trim();

  // 内容が空の場合はデフォルト
  if (!content) {
    content = 'リマインダー';
  }

  return { content, datetime };
}

module.exports = {
  createReminder,
  parseDateTime,
  formatDateTime,
  isReminderRequest,
  extractReminderInfo
};
