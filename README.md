# Alexa-Claude Voice Connector

Amazon AlexaデバイスからAnthropic Claudeと日本語で音声会話できるカスタムAlexaスキル。

## 概要

- **呼び出し名**: 「アレクサ、クロードを開いて」
- **対応言語**: 日本語 (ja-JP)
- **バックエンド**: AWS Lambda (Node.js 20.x)
- **AIモデル**: Claude Haiku 4.5 / Sonnet（切替可能）

## プロジェクト構成

```
alexa-claude-voice-integration/
├── ask-resources.json          # ASK CLI設定
├── package.json
├── lambda/
│   ├── package.json
│   └── src/
│       ├── index.js            # Lambda関数メイン
│       └── claude-client.js    # Claude API連携モジュール
└── skill-package/
    ├── skill.json              # スキルマニフェスト
    └── interactionModels/
        └── custom/
            └── ja-JP.json      # 日本語インタラクションモデル
```

## セットアップ

### 前提条件

- Node.js 20.x 以上
- ASK CLI v2 (`npm install -g ask-cli`)
- Amazon開発者アカウント
- AWSアカウント
- Anthropic APIキー

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd alexa-claude-voice-integration

# Lambda依存関係をインストール
cd lambda
npm install
cd ..

# ASK CLIでログイン
ask configure
```

### 環境変数の設定

Lambda関数に以下の環境変数を設定:

| 変数名 | 説明 |
|--------|------|
| `ANTHROPIC_API_KEY` | Anthropic APIキー |

### デプロイ

```bash
# スキルをデプロイ
ask deploy

# または個別にデプロイ
ask deploy --target skill-metadata
ask deploy --target skill-infrastructure
```

## 使い方

### 基本的な会話

1. 「アレクサ、クロードを開いて」でスキルを起動
2. 任意の質問を話しかける
3. 「おしまい」で終了

### モード切替（Phase 2）

- 「ギンさんモード」 - カジュアルなキャラクター
- 「丁寧モード」 - 敬語で応答
- 「フレンドリーモード」 - 友達口調

### モデル切替（Phase 2）

- 「ハイクにして」 - Haiku（高速・低コスト）
- 「ソネットにして」 - Sonnet（高性能）

## 機能一覧

### Phase 1 (MVP)

- [x] 音声入力の受付
- [x] Claude API呼び出し
- [x] 音声応答の返却
- [x] マルチターン会話（最大10ターン）
- [x] Progressive Response（タイムアウト対策）
- [x] 応答長制御（50字以内に要約）
- [x] エラーハンドリング

### Phase 2（実装済み）

- [x] ペルソナ切り替え
- [x] モデル切り替え
- [ ] 会話履歴永続化（DynamoDB）

## コスト見積

| 項目 | 月額費用 |
|------|---------|
| AWS Lambda | ￥0 (無料枠) |
| CloudWatch Logs | ￥0〜30 |
| Claude API (Haiku) | ￥25〜100 |
| **合計** | **￥25〜130/月** |

## トラブルシューティング

### タイムアウトエラー

Alexaは8秒でタイムアウトします。Progressive Responseで「考え中です...」を先行返却しています。

### 音声認識の誤り

Alexa ASRの制約です。プロンプトを調整するか、「もう一度言ってください」で再試行してください。

## ライセンス

MIT License
