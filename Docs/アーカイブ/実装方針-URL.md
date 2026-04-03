# URL実装方針（アーカイブ）

> 実装完了済み。設計-URL.mdから分離した実装方針の記録。

## 使用ライブラリ

`react-router-dom` v7（ブラウザルーター）

## ルート定義

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

## RootLayout の責務

1. タブバーの表示とタブ切り替え
2. Chatコンポーネントの常駐マウント（`display` で表示/非表示）
3. chatKeyの管理（URLからではなく、MinimalLayoutから受け取ったstateで算出）
4. セッション復帰時のメッセージfetch
5. ファイルページのOutlet提供

## 状態の整理

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

## Tauri アプリとの互換性

Tauriの WebView ではブラウザの戻る/進む物理ボタンはないが、History API は正常に動作する。ファイルタブ内では画面内の戻るボタンを使用する。

## API への影響

API エンドポイントは変更不要。フロントエンドのURLルーティングのみの変更。Express側の SPA フォールバックは実装済み。
