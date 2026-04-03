# Gitタブ実装方針（アーカイブ）

> 実装完了済み。仕様-Gitタブ.mdから分離した実装方針の記録。

## フロントエンド実装方針

### ファイル構成

```
frontend/src/
├── pages/
│   └── GitPage.tsx              # Gitタブのメインページ（Changes/History切り替え）
├── components/
│   └── git/
│       ├── GitHeader.tsx        # ブランチ表示 + Fetch/Pull/Push ボタン
│       ├── GitSubTabs.tsx       # Changes/History サブタブ切り替え
│       ├── GitFileList.tsx      # 変更ファイル一覧 + ステージングチェックボックス
│       ├── GitDiffView.tsx      # Diff表示エリア（Changesビュー）
│       ├── GitCommitBox.tsx     # コミットメッセージ + コミットボタン
│       ├── GitCommitList.tsx    # コミット履歴一覧（Historyビュー左ペイン）
│       └── GitCommitDetail.tsx  # コミット詳細 + ファイル別アコーディオンdiff（Historyビュー右ペイン）
└── hooks/
    ├── useGitStatus.ts          # Changes用の状態管理フック
    └── useGitHistory.ts         # History用の状態管理フック（履歴取得、ページネーション、詳細取得）
```

### ルーティング追加

```
/:repo (RootLayout)
  ├── /chat
  ├── /chat/:sessionId
  ├── /files/*
  └── /git              ← 新規追加
```

### タブ追加

RootLayoutのtabs配列に追加:

```tsx
{ key: "git", label: "Git", icon: <GitIcon /> }
```

### 状態管理

- **Changesビュー**: Gitタブを開いた時に `/status` を1回呼び出してファイル一覧を取得。ステージング操作後、コミット・Fetch・Pull・Push後も再取得
- **Historyビュー**: Historyサブタブに初めて切り替えた時に `/log` を1回呼び出して最新100件を取得。コミット選択時に `/show` で詳細を取得
- 自動ポーリングなし（手動リフレッシュのみ）

### マウント方針（Chatの常時マウントを維持する）

**重要: Chatコンポーネントは常時マウントを維持すること。**

現在の RootLayout の構造:
- Chat → `display: none/flex` で表示切り替え（常時マウント、SSE接続を維持）
- Files → `<Outlet />` 経由（タブ切り替えでアンマウント）

Gitタブ追加後の構造:

```tsx
{/* Chat（常にマウント、display で切り替え） */}
<Box sx={{ display: activeTab === "chat" ? "flex" : "none" }}>
  <Chat ... />
</Box>

{/* Files / Git（Outlet経由、ルーティングで排他的に切り替え） */}
<Box sx={{ display: activeTab !== "chat" ? "flex" : "none" }}>
  <Outlet />
</Box>
```

- Git と Files はどちらも `<Outlet />` を通じてレンダリングされ、ルーティングにより排他的に切り替わる
- Chat は他のタブがアクティブでも常にDOMに存在し、SSEストリーミング接続が途切れない
- Gitタブは常時接続の必要がなく、タブ切り替えごとに最新状態を取得する方が適切なため、Outlet経由で問題ない

## バックエンド実装方針

### ファイル構成

```
server/
└── routes/
    └── git.ts           # 全Gitエンドポイントを集約
```

### Gitコマンド実行

- Node.jsの `child_process.execFile` を使用（シェル経由しない）
- コマンドインジェクション防止のため、引数は配列で渡す
- 実行ディレクトリ（cwd）はリポジトリのフルパスを指定
- タイムアウト: 30秒（Fetch/Pull/Push）、10秒（status/diff/stage/unstage/commit）

### セキュリティ

- ファイルパスのバリデーション: `..` を含むパスは拒否
- リポジトリパスの存在確認: `.git` ディレクトリの存在をチェック
- コマンド引数のサニタイズ: `execFile` による自動エスケープに依存
