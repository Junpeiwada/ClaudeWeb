# HTTPS化（Tailscale Serve）

iPhoneからAgentNestにHTTPSでアクセスするための設定。
Screen Wake Lock API（AI応答中のスリープ防止）にはセキュアコンテキスト（HTTPS）が必要。

## 背景

- iPhoneからTailscale経由で `http://100.x.x.x:3000` でアクセスしている
- HTTPではScreen Wake Lock APIが使えない（セキュアコンテキスト必須）
- Tailscale Serveを使えばAgentNestのコード変更なしでHTTPS化できる

## 仕組み

```
iPhone Safari
  ↓ HTTPS (443)
Tailscale Serve（TLS終端・リバースプロキシ）
  ↓ HTTP (localhost:3000)
AgentNest Express サーバー
```

- Tailscale が TLS 証明書を自動管理（Let's Encrypt）
- Express サーバーは HTTP のまま変更不要
- アクセスは Tailnet 内のデバイスのみ（インターネットには公開されない）

## 前提条件

- macOS に Tailscale アプリがインストール済み
- Tailscale にログイン済み
- AgentNest サーバーが `localhost:3000` で起動していること（Serve自体は独立して動くが、アクセス時に必要）

## コマンド

CLIのパス: `/Applications/Tailscale.app/Contents/MacOS/Tailscale`

### 有効化

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 3000
```

`--bg` をつけるとバックグラウンドで永続化される（Mac再起動後も有効）。

### 状態確認

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve status
```

### 無効化

```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve off
```

## iPhoneからのアクセス

有効化後、iPhoneのSafariから以下のURLでアクセス:

```
https://junpeimac-mini.tail34f489.ts.net
```

- ポート指定不要（HTTPS標準の443）
- `http://100.113.106.109:3000` は引き続き使えるが、HTTPなのでWake Lock不可

## Tailnet での Serve 有効化

初回のみ、Tailscale の管理画面で Serve 機能を有効にする必要がある:

```
https://login.tailscale.com/admin/machines → 対象マシン → Serve を有効化
```

## ライフサイクル

| 状態 | Tailscale Serve | AgentNest |
|---|---|---|
| 初回セットアップ | `serve --bg 3000` を実行 | 通常通り起動 |
| 通常運用 | 常駐（自動起動） | 必要時に起動 |
| AgentNest停止中 | 動き続ける（502エラーを返す） | 停止中 |
| Mac再起動後 | 自動で復帰 | 手動またはTauriアプリで起動 |
| 不要になった時 | `serve off` で完全停止 | 影響なし |

## 依存関係

```
Wake Lock API（スリープ防止）
  └─ セキュアコンテキスト（HTTPS）が必要
       └─ Tailscale Serve がHTTPS化を担当
            └─ Tailscale アプリ（macOS）
            └─ AgentNest Express サーバー（HTTP, localhost:3000）
```

- Tailscale Serve と AgentNest は独立して動作する
- Tailscale Serve を止めても AgentNest には影響なし（HTTPアクセスは引き続き可能）
- AgentNest を止めても Tailscale Serve には影響なし（502が返るだけ）
