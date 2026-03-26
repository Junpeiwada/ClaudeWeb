# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重大なルール

### テスト修正の禁止（確認必須）
**テストが失敗した場合、テストコード自体を修正してはならない。** テストを修正する必要がある場合は、**必ずユーザーに確認してから**修正すること。実装コードの修正で対応できないか先に検討し、テスト側の変更が必要な場合のみ、理由を説明した上でユーザーの承認を得ること。

## 開発コマンド

```bash
# 開発（サーバー + フロントエンド同時起動）
npm run dev

# サーバーのみ（tsx watch、ポート3000）
npm run dev:server

# フロントエンドのみ（Vite、ポート5173）
npm run dev:frontend

# プロダクションビルド（フロントエンドのみ）
npm run build

# プロダクション起動（ビルド済みフロントエンド必須）
npm start

# テスト（Playwright E2E）
npm test

# テスト（UI モード）
npm run test:ui

# 単一テスト実行
npx playwright test tests/chat.spec.ts

# フロントエンドのlint
cd frontend && npm run lint
```

**セットアップ**: `npm install && cd frontend && npm install`

## アーキテクチャ

ブラウザからClaude Codeを操作するWebインターフェース。Express APIサーバーがClaude Code SDKを呼び出し、SSE（Server-Sent Events）でフロントエンドにリアルタイムストリーミングする構成。

### サーバー（`server/`）

- **`index.ts`** — Expressアプリ起動、静的ファイル配信、ルートマウント
- **`claude/executor.ts`** — 中核ロジック。Claude Code SDK `query()` のラッパー。SSEイベント送信、セッション状態管理、権限承認フロー、autoEdit機能、ログ出力を担当
- **`claude/commandExpander.ts`** — `.claude/commands/` 配下のスラッシュコマンド展開
- **`routes/`** — 各APIエンドポイント（chat, repos, sessions, files, permission, reconnect, status）

### フロントエンド（`frontend/`）

- React 19 + Vite + MUI 7
- **`hooks/useChat.ts`** — SSEストリーム処理、再接続ロジック。フロントエンドの中核
- **`components/`** — Chat, MessageList, MessageInput, Header, FileExplorer, FileViewer, PermissionDialog, RepoSelector, SessionHistory 等

### 主要な通信フロー

1. ユーザーがメッセージ送信 → POST `/api/chat` （SSEレスポンス）
2. サーバーが `executor.ts` でClaude Code SDK `query()` を実行
3. SSEイベントタイプ: `text`, `activity`, `tool_result`, `permission`, `done`, `error`, `session_id`, `limit_error`
4. ツール実行時に権限要求 → `permission` イベント → フロントエンドでダイアログ表示 → POST `/api/permission` で承認/拒否
5. 切断時は `/api/reconnect` で状態スナップショットを取得し再接続（最大3回リトライ）

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 19, Vite 8, MUI 7, react-markdown |
| バックエンド | Express 5, tsx (実行), TypeScript |
| AI | @anthropic-ai/claude-code SDK |
| リアルタイム通信 | Server-Sent Events |
| テスト | Playwright（E2E、Chromiumのみ） |

### 設計上の注意点

- セッション状態はサーバーのインメモリ変数 `currentSession` で管理（シングルユーザー前提）
- 開発時はViteプロキシ（`/api` → `localhost:3000`）でCORS回避
- プロダクションではExpressがフロントエンドの静的ファイルも配信
- リポジトリのベースパスは環境変数 `BASE_PROJECT_DIR`（`.env`）で設定
- テストはAPIモックベース（`page.route()` でSSEレスポンスをモック）
