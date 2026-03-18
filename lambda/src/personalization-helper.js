/**
 * Personalization Helper
 * Alexa Voice ID / パーソナライゼーション機能との連携
 */

/**
 * 話者のpersonIdを取得
 * @param {object} handlerInput - Alexa handler input
 * @returns {string|null}
 */
function getPersonId(handlerInput) {
  const person = handlerInput.requestEnvelope.context.System.person;
  return person?.personId || null;
}

/**
 * パーソナライゼーションが有効かチェック
 * @param {object} handlerInput - Alexa handler input
 * @returns {boolean}
 */
function isPersonalized(handlerInput) {
  return !!getPersonId(handlerInput);
}

/**
 * Person Profile APIから話者の名前を取得
 * @param {object} handlerInput - Alexa handler input
 * @returns {Promise<string|null>}
 */
async function getSpeakerName(handlerInput) {
  const personId = getPersonId(handlerInput);
  if (!personId) {
    return null;
  }

  const { serviceClientFactory, requestEnvelope } = handlerInput;
  const consentToken = requestEnvelope.context.System.apiAccessToken;

  if (!consentToken) {
    console.log('No consent token available for person profile');
    return null;
  }

  try {
    const upsServiceClient = serviceClientFactory.getUpsServiceClient();
    const profileName = await upsServiceClient.getPersonsProfileGivenName();
    return profileName || null;
  } catch (error) {
    console.log('Failed to get person profile name:', error.message);

    // 権限エラーの場合はnullを返す（スキルは継続可能）
    if (error.statusCode === 403 || error.statusCode === 401) {
      return null;
    }

    // その他のエラーもnullを返す
    return null;
  }
}

/**
 * アカウントの名前を取得（フォールバック用）
 * @param {object} handlerInput - Alexa handler input
 * @returns {Promise<string|null>}
 */
async function getAccountName(handlerInput) {
  const { serviceClientFactory, requestEnvelope } = handlerInput;
  const consentToken = requestEnvelope.context.System.apiAccessToken;

  if (!consentToken) {
    return null;
  }

  try {
    const upsServiceClient = serviceClientFactory.getUpsServiceClient();
    const profileName = await upsServiceClient.getProfileGivenName();
    return profileName || null;
  } catch (error) {
    console.log('Failed to get account profile name:', error.message);
    return null;
  }
}

/**
 * 話者情報を取得（パーソナライズ対応）
 * @param {object} handlerInput - Alexa handler input
 * @returns {Promise<{personId: string|null, name: string|null, isRecognized: boolean}>}
 */
async function getSpeakerInfo(handlerInput) {
  const personId = getPersonId(handlerInput);
  const isRecognized = !!personId;

  // Voice IDで認識された話者の名前を取得
  let name = null;
  if (isRecognized) {
    name = await getSpeakerName(handlerInput);
  }

  // 名前が取得できない場合、アカウント名を試す
  if (!name) {
    name = await getAccountName(handlerInput);
  }

  return {
    personId,
    name,
    isRecognized
  };
}

/**
 * パーソナライズされた挨拶を生成
 * @param {object} speakerInfo - getSpeakerInfoの結果
 * @param {string} timeOfDay - 時間帯 ('morning'|'afternoon'|'evening')
 * @returns {string}
 */
function getPersonalizedGreeting(speakerInfo, timeOfDay = null) {
  const now = new Date();
  const hour = now.getHours();

  // 時間帯を判定
  let greeting;
  if (timeOfDay === 'morning' || (hour >= 5 && hour < 12)) {
    greeting = 'おはようございます';
  } else if (timeOfDay === 'afternoon' || (hour >= 12 && hour < 18)) {
    greeting = 'こんにちは';
  } else {
    greeting = 'こんばんは';
  }

  // 名前がある場合はパーソナライズ
  if (speakerInfo.name) {
    return `${speakerInfo.name}さん、${greeting}！`;
  }

  return `${greeting}！`;
}

/**
 * 話者ごとの設定を取得するためのキーを生成
 * @param {string} userId - デバイスのユーザーID
 * @param {string|null} personId - 話者のpersonId
 * @returns {string}
 */
function getSpeakerKey(userId, personId) {
  if (personId) {
    return `${userId}:${personId}`;
  }
  return userId;
}

module.exports = {
  getPersonId,
  isPersonalized,
  getSpeakerName,
  getAccountName,
  getSpeakerInfo,
  getPersonalizedGreeting,
  getSpeakerKey
};
