# URL設計

## 設計思想

**チャットのライフサイクルとURLルーティングを分離する。**

チャットコンポーネントはSSEストリーミング接続を持つステートフルなコンポーネントであり、URL遷移による意図しない再マウントで接続が切断されてはならない。チャットの再マウントは「明示的なユーザーアクション」（新規作成・履歴選択・リポジトリ変更）のときのみ発生させる。

### 原則

1. **Chatは明示的な操作（New / History選択）がない限りアンマウントしない**: URL遷移、タブ切り替え、ブラウザの戻る/進む、いずれもChatを破壊しない。これにより進行中のSSEストリーミングやチャット表示が保持される
2. **Chatの再マウントトリガーは3つだけ**: 新規チャット作成（New）、履歴からのセッション選択（History）、リポジトリ変更
3. **URLは状態の「反映」であり「駆動源」ではない**: chatKeyの算出にURLパラメータを使わない
4. **ファイルタブのナビゲーションはURLベース**: 戻る/進むが自然に機能する

## URL体系

### ルート一覧

| URL パターン | 画面 | 例 |
|---|---|---|
| `/` | リポジトリ未選択 | -- |
| `/:repo/chat` | チャット（新規 or 進行中） | `/AgentNest/chat` |
| `/:repo/chat/:sessionId` | チャット（セッション復帰） | `/AgentNest/chat/abc123` |
| `/:repo/files` | ファイル一覧（ルート） | `/AgentNest/files` |
| `/:repo/files/*path` | ファイル一覧 or ファイル閲覧 | `/AgentNest/files/src/App.tsx` |

### sessionID の扱い

- **新規チャット開始時**: URLは `/:repo/chat` のまま変えない
- **会話中にsessionIdが確定しても**: URLを変更しない（`navigate()` を呼ばない）
- **セッション履歴から選択時**: `/:repo/chat/:sessionId` に遷移し、メッセージfetch後にChatを再マウント
- **理由**: SSEストリーミング中にReact Routerの `navigate()` を実行すると、URLパラメータの変化 → chatKeyの変化 → Chatの再マウント → SSE接続切断という連鎖が発生する

## Chatの再マウント制御

### chatKey の算出（核心）

```
chatKey = urlSessionIdからではなく、明示的アクションから算出する

- 新規チャット: `new:{repoId}:{newChatNonce}`
- 履歴復帰:     `session:{sessionId}`    （fetchedSessionから取得）
- リポジトリ変更: repoId変更でnonce更新 → 新規チャットと同じ
```

**重要**: `chatKey` の算出にURL由来の値（`useParams` の `:sessionId`）を直接使わない。代わりに、明示的なアクション（ボタンクリック、履歴選択）が発生したときにのみstateを更新し、そのstateからchatKeyを算出する。

### 再マウントが発生するケースと発生しないケース

| 操作 | chatKey変化 | 再マウント |
|---|---|---|
| メッセージ送信（sessionId確定） | 変化なし | しない |
| ファイルタブ → チャットタブ | 変化なし | しない |
| チャットタブ → ファイルタブ | 変化なし | しない |
| ファイルタブ内で戻る/進む | 変化なし | しない |
| ブラウザリロード | -- | 初回マウント |
| 「新規チャット」ボタン | nonce更新 | する |
| 履歴からセッション選択 | sessionId変更 | する |
| リポジトリ変更 | repoId変更 | する |

### URL同期の方法

チャットの状態変化に伴うURL更新は `window.history.replaceState` を使い、React Routerのナビゲーションを**バイパス**する。これにより、URLバーの表示は更新されるが、React Routerの再レンダリングは発生しない。

```ts
// sessionId確定時のURL同期（再マウントを起こさない）
onSessionIdChange={(sessionId) => {
  if (sessionId) {
    const newUrl = `/${encodeURIComponent(repoId)}/chat/${encodeURIComponent(sessionId)}`;
    window.history.replaceState(null, "", newUrl);
  }
}}
```

一方、以下の場合はReact Routerの `navigate()` を使う（意図的な再マウントが必要なため）：
- 履歴からセッション選択 → `navigate(`/:repo/chat/:sessionId`)`
- ファイルタブ切り替え → `navigate(`/:repo/files`)`
- リポジトリ変更 → `navigate(`/:newRepo/chat`)`

## ナビゲーションフロー

```
ユーザー操作                          URL変化                    Chat再マウント
───────────────────────────────────────────────────────────────────────────
アプリ起動                            /AgentNest/chat             初回マウント
メッセージ送信 → sessionId確定         /AgentNest/chat             なし（URLも変えない）
「ファイル」タブクリック                /AgentNest/files            なし（display:none）
「src」フォルダクリック                /AgentNest/files/src        なし
ブラウザ「戻る」                       /AgentNest/files            なし
「チャット」タブクリック                /AgentNest/chat             なし（display:flex）
セッション履歴から選択                 /AgentNest/chat/abc123      する（navigate）
「新規チャット」ボタン                 /AgentNest/chat             する（nonce更新）
リポジトリ切り替え(MyProject)          /MyProject/chat             する（repoId変更）
```

## 実装方針

### 使用ライブラリ

`react-router-dom` v7（ブラウザルーター）

### ルート定義

```tsx
const router = createBrowserRouter([
  {
    path: "/",
    element: <MinimalLayout />,
    children: [
      { index: true, element: <RepoRedirect /> },
      {
        path: ":repo",
        element: <RootLayout />,
        children: [
          { index: true, element: <Navigate to="chat" replace /> },
          { path: "chat", element: <ChatPlaceholder /> },
          { path: "chat/:sessionId", element: <ChatPlaceholder /> },
          { path: "files", element: <FilesPage /> },
          { path: "files/*", element: <FilesPage /> },
        ],
      },
    ],
  },
]);
```

`ChatPlaceholder` は `null` を返すダミーコンポーネント。Chatは `RootLayout` 内で直接マウントし、Outletの外に置く。

### RootLayout の責務

1. タブバーの表示とタブ切り替え
2. Chatコンポーネントの常駐マウント（`display` で表示/非表示）
3. chatKeyの管理（URLからではなく、MinimalLayoutから受け取ったstateで算出）
4. セッション復帰時のメッセージfetch
5. ファイルページのOutlet提供

### 状態の整理

| 状態 | 管理場所 |
|---|---|
| `activeTab` | URLパスから導出（`/files` を含むか否か） |
| `currentDir`（FileExplorer） | URLパスから導出 |
| `selectedFile`（FileExplorer） | URLパスから導出 |
| `repoId` | URLパラメータ `:repo` |
| `sessionId`（進行中） | useChat内部のstate（URLに反映しない） |
| `sessionId`（復帰時） | MinimalLayoutのコールバック経由でstateに設定 |
| `newChatNonce` | MinimalLayoutのstate |
| `autoEdit` | `localStorage` |

### Tauri アプリとの互換性

Tauriの WebView ではブラウザの戻る/進む物理ボタンはないが、History API は正常に動作する。ファイルタブ内では画面内の戻るボタンを使用する。

### API への影響

API エンドポイントは変更不要。フロントエンドのURLルーティングのみの変更。Express側の SPA フォールバックは実装済み。
