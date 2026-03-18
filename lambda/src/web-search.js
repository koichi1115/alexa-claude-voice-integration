/**
 * Web Search Module
 * Brave Search APIを使用したWeb検索機能
 */

const https = require('https');

class WebSearchClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'api.search.brave.com';
  }

  /**
   * Web検索を実行
   * @param {string} query - 検索クエリ
   * @param {number} count - 結果数 (default: 3)
   * @returns {Promise<Array<{title: string, description: string, url: string}>>}
   */
  async search(query, count = 3) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        q: query,
        count: count.toString(),
        search_lang: 'jp',
        country: 'JP',
        text_format: 'raw'
      });

      const options = {
        hostname: this.baseUrl,
        path: `/res/v1/web/search?${params.toString()}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode !== 200) {
              reject(new Error(`Search API Error: ${res.statusCode}`));
              return;
            }

            const webResults = result.web?.results || [];
            const formatted = webResults.slice(0, count).map(r => ({
              title: r.title,
              description: r.description,
              url: r.url
            }));

            resolve(formatted);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Search request timeout'));
      });
      req.end();
    });
  }

  /**
   * 検索結果をテキスト形式にフォーマット
   * @param {Array} results - 検索結果
   * @returns {string}
   */
  formatResults(results) {
    if (!results || results.length === 0) {
      return '検索結果が見つかりませんでした。';
    }

    return results.map((r, i) =>
      `${i + 1}. ${r.title}\n${r.description}`
    ).join('\n\n');
  }
}

module.exports = { WebSearchClient };
