/**
 * APL (Alexa Presentation Language) Helper
 * 画面付きデバイス向けのレスポンシブ表示を提供
 */

/**
 * デバイスがAPLをサポートしているかチェック
 * @param {object} handlerInput - Alexa handler input
 * @returns {boolean}
 */
function supportsAPL(handlerInput) {
  const supportedInterfaces = handlerInput.requestEnvelope.context.System.device?.supportedInterfaces;
  return supportedInterfaces && supportedInterfaces['Alexa.Presentation.APL'];
}

/**
 * ビューポート情報を取得
 * @param {object} handlerInput - Alexa handler input
 * @returns {object|null}
 */
function getViewport(handlerInput) {
  const viewport = handlerInput.requestEnvelope.context.Viewport;
  if (!viewport) return null;

  return {
    shape: viewport.shape,
    width: viewport.pixelWidth,
    height: viewport.pixelHeight,
    mode: viewport.mode,
    dpi: viewport.dpi
  };
}

/**
 * メイン応答用APLドキュメント
 * チャット応答を表示
 */
const CHAT_RESPONSE_DOCUMENT = {
  type: 'APL',
  version: '2024.1',
  theme: 'dark',
  import: [
    {
      name: 'alexa-layouts',
      version: '1.7.0'
    }
  ],
  mainTemplate: {
    parameters: ['payload'],
    items: [
      {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        items: [
          // ヘッダー
          {
            type: 'Container',
            width: '100%',
            height: '15%',
            paddingLeft: '5vw',
            paddingRight: '5vw',
            alignItems: 'center',
            justifyContent: 'center',
            items: [
              {
                type: 'Text',
                text: '${payload.title}',
                style: 'textStyleDisplay4',
                textAlign: 'center',
                color: '#FFFFFF',
                maxLines: 1
              }
            ]
          },
          // メインコンテンツ
          {
            type: 'ScrollView',
            width: '100%',
            height: '70%',
            paddingLeft: '5vw',
            paddingRight: '5vw',
            items: [
              {
                type: 'Container',
                width: '100%',
                items: [
                  // ユーザー質問
                  {
                    when: '${payload.userQuery}',
                    type: 'Container',
                    width: '100%',
                    paddingBottom: '2vh',
                    items: [
                      {
                        type: 'Text',
                        text: 'あなた',
                        style: 'textStyleBody',
                        color: '#00BFFF',
                        fontWeight: 'bold'
                      },
                      {
                        type: 'Text',
                        text: '${payload.userQuery}',
                        style: 'textStyleBody',
                        color: '#CCCCCC'
                      }
                    ]
                  },
                  // アシスタント応答
                  {
                    type: 'Container',
                    width: '100%',
                    items: [
                      {
                        type: 'Text',
                        text: 'クロ先生',
                        style: 'textStyleBody',
                        color: '#FFD700',
                        fontWeight: 'bold'
                      },
                      {
                        type: 'Text',
                        text: '${payload.response}',
                        style: 'textStyleBody',
                        color: '#FFFFFF',
                        textAlign: 'start'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          // フッター（ヒント）
          {
            type: 'Container',
            width: '100%',
            height: '15%',
            paddingLeft: '5vw',
            paddingRight: '5vw',
            alignItems: 'center',
            justifyContent: 'center',
            items: [
              {
                type: 'Text',
                text: '${payload.hint}',
                style: 'textStyleDetail',
                color: '#888888',
                textAlign: 'center'
              }
            ]
          }
        ]
      }
    ]
  }
};

/**
 * ウェルカム画面用APLドキュメント
 */
const WELCOME_DOCUMENT = {
  type: 'APL',
  version: '2024.1',
  theme: 'dark',
  import: [
    {
      name: 'alexa-layouts',
      version: '1.7.0'
    }
  ],
  mainTemplate: {
    parameters: ['payload'],
    items: [
      {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        items: [
          {
            type: 'Text',
            text: '${payload.title}',
            style: 'textStyleDisplay3',
            textAlign: 'center',
            color: '#FFFFFF'
          },
          {
            type: 'Text',
            text: '${payload.subtitle}',
            style: 'textStyleBody',
            textAlign: 'center',
            color: '#CCCCCC',
            paddingTop: '3vh'
          },
          {
            when: '${payload.userName}',
            type: 'Text',
            text: '${payload.userName}さん、こんにちは！',
            style: 'textStyleCallout',
            textAlign: 'center',
            color: '#FFD700',
            paddingTop: '5vh'
          },
          {
            type: 'Text',
            text: '${payload.hint}',
            style: 'textStyleDetail',
            textAlign: 'center',
            color: '#888888',
            paddingTop: '5vh'
          }
        ]
      }
    ]
  }
};

/**
 * Web検索結果表示用APLドキュメント
 */
const SEARCH_RESULTS_DOCUMENT = {
  type: 'APL',
  version: '2024.1',
  theme: 'dark',
  import: [
    {
      name: 'alexa-layouts',
      version: '1.7.0'
    }
  ],
  mainTemplate: {
    parameters: ['payload'],
    items: [
      {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        items: [
          // ヘッダー
          {
            type: 'Container',
            width: '100%',
            height: '12%',
            paddingLeft: '5vw',
            paddingRight: '5vw',
            alignItems: 'center',
            justifyContent: 'center',
            items: [
              {
                type: 'Text',
                text: '検索結果',
                style: 'textStyleDisplay4',
                color: '#00BFFF'
              }
            ]
          },
          // 検索結果リスト
          {
            type: 'Sequence',
            width: '100%',
            height: '73%',
            paddingLeft: '5vw',
            paddingRight: '5vw',
            scrollDirection: 'vertical',
            data: '${payload.results}',
            items: [
              {
                type: 'Container',
                width: '100%',
                paddingBottom: '2vh',
                items: [
                  {
                    type: 'Text',
                    text: '${data.title}',
                    style: 'textStyleBody',
                    color: '#FFD700',
                    fontWeight: 'bold',
                    maxLines: 1
                  },
                  {
                    type: 'Text',
                    text: '${data.description}',
                    style: 'textStyleDetail',
                    color: '#CCCCCC',
                    maxLines: 3
                  }
                ]
              }
            ]
          },
          // 回答
          {
            type: 'Container',
            width: '100%',
            height: '15%',
            paddingLeft: '5vw',
            paddingRight: '5vw',
            items: [
              {
                type: 'Text',
                text: '${payload.answer}',
                style: 'textStyleBody',
                color: '#FFFFFF',
                maxLines: 3
              }
            ]
          }
        ]
      }
    ]
  }
};

/**
 * APLディレクティブを作成
 * @param {object} document - APLドキュメント
 * @param {object} datasources - データソース
 * @returns {object} APLディレクティブ
 */
function createAPLDirective(document, datasources) {
  return {
    type: 'Alexa.Presentation.APL.RenderDocument',
    version: '1.0',
    document: document,
    datasources: datasources
  };
}

/**
 * チャット応答用APLディレクティブを作成
 * @param {string} userQuery - ユーザーの質問
 * @param {string} response - アシスタントの応答
 * @param {string} hint - ヒントテキスト
 * @returns {object}
 */
function createChatResponseDirective(userQuery, response, hint = '何か質問してください') {
  return createAPLDirective(CHAT_RESPONSE_DOCUMENT, {
    payload: {
      title: 'クロ先生',
      userQuery: userQuery,
      response: response,
      hint: hint
    }
  });
}

/**
 * ウェルカム画面用APLディレクティブを作成
 * @param {string} userName - ユーザー名（パーソナライズ用）
 * @returns {object}
 */
function createWelcomeDirective(userName = null) {
  return createAPLDirective(WELCOME_DOCUMENT, {
    payload: {
      title: 'クロ先生',
      subtitle: 'AIと日本語で会話しましょう',
      userName: userName,
      hint: '「今日の天気は？」「最新ニュースを教えて」など'
    }
  });
}

/**
 * 検索結果表示用APLディレクティブを作成
 * @param {Array} results - 検索結果配列 [{title, description}]
 * @param {string} answer - 回答テキスト
 * @returns {object}
 */
function createSearchResultsDirective(results, answer) {
  return createAPLDirective(SEARCH_RESULTS_DOCUMENT, {
    payload: {
      results: results,
      answer: answer
    }
  });
}

module.exports = {
  supportsAPL,
  getViewport,
  createChatResponseDirective,
  createWelcomeDirective,
  createSearchResultsDirective,
  CHAT_RESPONSE_DOCUMENT,
  WELCOME_DOCUMENT,
  SEARCH_RESULTS_DOCUMENT
};
