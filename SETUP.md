# セットアップガイド

Alexa-Claude Voice Connectorの詳細セットアップ手順。

## 1. 開発環境の準備

### Node.js

Node.js 20.x以上をインストール:

```bash
# バージョン確認
node --version  # v20.x.x
npm --version
```

### ASK CLI

```bash
# ASK CLIをグローバルインストール
npm install -g ask-cli

# バージョン確認
ask --version  # 2.x.x
```

## 2. アカウント設定

### Amazon開発者アカウント

1. [Amazon Developer Console](https://developer.amazon.com/) にアクセス
2. アカウントを作成またはログイン
3. Alexa Skills Kitを有効化

### AWSアカウント

1. [AWS Console](https://console.aws.amazon.com/) にアクセス
2. IAMユーザーを作成（Lambda操作権限付き）
3. アクセスキーを取得

### Anthropic APIキー

1. [Anthropic Console](https://console.anthropic.com/) にアクセス
2. APIキーを生成
3. 月額上限を設定（推奨: $5〜10）

## 3. ASK CLIの設定

```bash
# ASK CLIをAmazon開発者アカウントとAWSに接続
ask configure

# プロンプトに従って:
# 1. Amazonアカウントでログイン（ブラウザが開く）
# 2. AWSプロファイルを選択または作成
```

## 4. プロジェクトのデプロイ

### 依存関係のインストール

```bash
cd alexa-claude-voice-integration/lambda
npm install
cd ..
```

### 初回デプロイ

```bash
ask deploy
```

これにより:
- Alexaスキルが作成される
- Lambda関数がデプロイされる
- スキルとLambdaが接続される

### Lambda環境変数の設定

AWS Consoleで手動設定:

1. [Lambda Console](https://ap-northeast-1.console.aws.amazon.com/lambda/) を開く
2. 関数 `ask-alexa-claude-skill-...` を選択
3. 「設定」→「環境変数」
4. 以下を追加:

| キー | 値 |
|------|-----|
| `ANTHROPIC_API_KEY` | sk-ant-... |

## 5. テスト

### Alexa Developer Consoleでテスト

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) を開く
2. スキルを選択
3. 「テスト」タブ
4. 「開発中」を有効化
5. 「アレクサ、クロードを開いて」と入力

### 実機テスト

1. 同じAmazonアカウントでEchoデバイスにログイン
2. 「アレクサ、クロードを開いて」と話しかける

## 6. skill.jsonの更新

デプロイ後、`skill-package/skill.json`のLambda ARNを更新:

```json
{
  "apis": {
    "custom": {
      "endpoint": {
        "uri": "arn:aws:lambda:ap-northeast-1:123456789012:function:ask-alexa-claude-skill-default"
      }
    }
  }
}
```

実際のARNはAWS Lambdaコンソールで確認できます。

## 7. CloudWatch監視の設定（オプション）

### コストアラート

1. AWS CloudWatchでアラームを作成
2. Lambda実行回数の閾値を設定
3. SNSでメール通知を設定

### ログ確認

```bash
# CloudWatch Logsでログを確認
aws logs tail /aws/lambda/ask-alexa-claude-skill-default --follow
```

## トラブルシューティング

### デプロイエラー

```bash
# スキルの状態を確認
ask smapi get-skill-status -s <skill-id>

# ログを確認
ask deploy --debug
```

### Lambda実行エラー

```bash
# CloudWatchログを確認
aws logs get-log-events \
  --log-group-name /aws/lambda/ask-alexa-claude-skill-default \
  --log-stream-name '<latest-stream>'
```

### APIキー関連エラー

- `401 Unauthorized`: APIキーが無効
- `429 Rate Limited`: レート制限に到達
- 環境変数が正しく設定されているか確認
