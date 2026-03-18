/**
 * In-Skill Purchasing (ISP) Helper
 * サブスクリプション管理用ヘルパー
 */

const PRODUCT_ID = 'claude_premium';

/**
 * サブスクリプションの状態を取得
 */
async function getSubscriptionStatus(handlerInput) {
  try {
    const locale = handlerInput.requestEnvelope.request.locale;
    const monetizationClient = handlerInput.serviceClientFactory.getMonetizationServiceClient();
    const products = await monetizationClient.getInSkillProducts(locale);

    const subscription = products.inSkillProducts.find(
      product => product.referenceName === PRODUCT_ID
    );

    if (!subscription) {
      console.log('Premium subscription product not found');
      return { entitled: false, product: null };
    }

    const entitled = subscription.entitled === 'ENTITLED';
    console.log(`Subscription status: ${subscription.entitled}`);

    return { entitled, product: subscription };
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return { entitled: false, product: null, error };
  }
}

/**
 * 購入フローを開始するディレクティブを生成
 */
function getBuyDirective(productId) {
  return {
    type: 'Connections.SendRequest',
    name: 'Buy',
    payload: {
      InSkillProduct: {
        productId: productId
      }
    },
    token: 'buy_premium'
  };
}

/**
 * キャンセルフローを開始するディレクティブを生成
 */
function getCancelDirective(productId) {
  return {
    type: 'Connections.SendRequest',
    name: 'Cancel',
    payload: {
      InSkillProduct: {
        productId: productId
      }
    },
    token: 'cancel_premium'
  };
}

/**
 * アップセル（購入促進）ディレクティブを生成
 */
function getUpsellDirective(productId, upsellMessage) {
  return {
    type: 'Connections.SendRequest',
    name: 'Upsell',
    payload: {
      InSkillProduct: {
        productId: productId
      },
      upsellMessage: upsellMessage
    },
    token: 'upsell_premium'
  };
}

/**
 * 1日の無料利用回数を取得/更新
 */
function getUsageCount(sessionAttributes) {
  const today = new Date().toISOString().split('T')[0];

  if (sessionAttributes.usageDate !== today) {
    sessionAttributes.usageDate = today;
    sessionAttributes.usageCount = 0;
  }

  return sessionAttributes.usageCount || 0;
}

/**
 * 利用回数をインクリメント
 */
function incrementUsage(sessionAttributes) {
  const today = new Date().toISOString().split('T')[0];

  if (sessionAttributes.usageDate !== today) {
    sessionAttributes.usageDate = today;
    sessionAttributes.usageCount = 1;
  } else {
    sessionAttributes.usageCount = (sessionAttributes.usageCount || 0) + 1;
  }

  return sessionAttributes.usageCount;
}

// 無料プランの1日あたりの利用制限
const FREE_DAILY_LIMIT = 10;

module.exports = {
  PRODUCT_ID,
  FREE_DAILY_LIMIT,
  getSubscriptionStatus,
  getBuyDirective,
  getCancelDirective,
  getUpsellDirective,
  getUsageCount,
  incrementUsage
};
