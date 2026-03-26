# AgentNest: Electron → Tauri 移行計画

## 1. 移行の目的

| 項目 | Electron (現状) | Tauri (移行後) |
|------|----------------|---------------|
| `.app` サイズ | 342MB | ~10-15MB |
| 配布 zip サイズ | 145MB | ~5-8MB |
| メモリ使用量 | ~150MB+ (Chromium) | ~30MB (WebKit) |
| 起動速度 | 遅い | 高速 |

Electronはアプリ全体の99%がChromiumエンジンで、AgentNestが実際に使っている機能（トレイ + 小さな設定パネル + サーバー管理）に対して大きすぎる。Tauriはシステムの WebKit (Safari) を使うため、同じ機能を1/30のサイズで実現できる。

---

## 2. 現状のアーキテクチャ

```
┌──────────────── Electron App ────────────────────┐
│                                                    │
│  Electron Main Process (Node.js)                  │
│  ├── main.ts         ← ウィンドウ管理、IPC、メニュー │
│  ├── server-manager.ts ← child_process.fork()      │
│  ├── config-store.ts  ← JSON ファイル読み書き       │
│  ├── tray.ts          ← システムトレイ              │
│  ├── updater.ts       ← electron-updater           │
│  └── preload.ts       ← contextBridge API          │
│                                                    │
│  Browser Window (Chromium)                         │
│  └── app.html (設定パネルUI 650行)                  │
│                                                    │
│  Express Server (fork子プロセス)                    │
│  └── server/ (Claude Code SDK連携)                 │
│                                                    │
│  Frontend (Vite + React)                           │
│  └── frontend/dist/ (Expressが配信)                │
└────────────────────────────────────────────────────┘
```

### Electronが担っている機能一覧

| # | 機能 | 実装ファイル | 使用API |
|---|------|------------|---------|
| 1 | 設定パネルウィンドウ (420x560) | `main.ts`, `app.html` | `BrowserWindow`, `ipcMain` |
| 2 | サーバープロセス管理 | `server-manager.ts` | `child_process.fork()` |
| 3 | 設定永続化 (config.json) | `config-store.ts` | `fs`, `app.getPath()` |
| 4 | システムトレイ | `tray.ts` | `Tray`, `Menu`, `nativeImage` |
| 5 | 自動更新 (GitHub Releases) | `updater.ts` | `electron-updater` |
| 6 | ディレクトリ選択ダイアログ | `main.ts` | `dialog.showOpenDialog()` |
| 7 | ブラウザでURL表示 | `main.ts` | `shell.openExternal()` |
| 8 | macOSメニューバー | `main.ts` | `Menu.setApplicationMenu()` |
| 9 | ウィンドウ位置記憶 | `main.ts` | `BrowserWindow.getBounds()` |
| 10 | Dock/Aboutパネル | `main.ts` | `app.dock`, `app.setAboutPanelOptions()` |

---

## 3. Tauri移行後のアーキテクチャ

```
┌──────────────── Tauri App ───────────────────────┐
│                                                    │
│  Rust Backend (src-tauri/src/)                    │
│  ├── main.rs       ← アプリ起動、プラグイン設定     │
│  ├── server.rs     ← サーバープロセス管理 (Command) │
│  ├── tray.rs       ← システムトレイ               │
│  └── lib.rs        ← Tauri コマンド定義           │
│                                                    │
│  WebView (macOS WebKit / Safari)                  │
│  └── app.html → そのまま流用（API呼び出し部分のみ変更）│
│                                                    │
│  Sidecar: Node.js Server                          │
│  └── server/ をバンドルしたNode.jsバイナリ          │
│                                                    │
│  Frontend (Vite + React) ← 変更なし               │
│  └── frontend/dist/ (Expressが配信)               │
│                                                    │
│  Plugins:                                          │
│  ├── tauri-plugin-updater   (GitHub Releases)     │
│  ├── tauri-plugin-dialog    (ディレクトリ選択)      │
│  ├── tauri-plugin-shell     (ブラウザ起動)         │
│  └── tauri-plugin-store     (設定永続化)           │
└────────────────────────────────────────────────────┘
```

---

## 4. 機能マッピング（Electron → Tauri）

### 4.1 IPC通信

**Electron**: `ipcMain.handle()` + `ipcRenderer.invoke()` + `preload.ts`

**Tauri**: `#[tauri::command]` + `invoke()` (フロントエンド)

```rust
// Rust側 (src-tauri/src/lib.rs)
#[tauri::command]
fn get_config(state: State<AppState>) -> Result<AppConfig, String> { ... }

#[tauri::command]
async fn start_server(state: State<AppState>) -> Result<(), String> { ... }

#[tauri::command]
async fn stop_server(state: State<AppState>) -> Result<(), String> { ... }

#[tauri::command]
fn get_server_status(state: State<AppState>) -> ServerStatus { ... }
```

```javascript
// フロントエンド側 (app.html内)
import { invoke } from '@tauri-apps/api/core';
const config = await invoke('get_config');
await invoke('start_server');
```

### 4.2 イベント通知（サーバー状態変更）

**Electron**: `mainWindow.webContents.send()` + `ipcRenderer.on()`

**Tauri**: `app.emit()` + `listen()`

```rust
// Rust側
app_handle.emit("server-status-change", &status)?;
```

```javascript
// フロントエンド側
import { listen } from '@tauri-apps/api/event';
await listen('server-status-change', (event) => {
  updateUI(event.payload);
});
```

### 4.3 サーバープロセス管理

**Electron**: `child_process.fork()` でNode.jsサーバーを起動

**Tauri**: `tauri::api::process::Command` でサイドカープロセスを起動

```rust
// Rust側 (src-tauri/src/server.rs)
use tauri_plugin_shell::ShellExt;

pub async fn start_server(app: &AppHandle, base_dir: &str, port: u16) -> Result<()> {
    let sidecar = app.shell()
        .sidecar("node-server")?  // バンドル済みNode.jsサーバー
        .env("BASE_PROJECT_DIR", base_dir)
        .env("PORT", port.to_string())
        .spawn()?;
    // ...
}
```

**サイドカー方式の選択肢**:

| 方式 | サイズ | 説明 |
|------|-------|------|
| **A. システムのNode.jsを使う** | 0MB追加 | `node dist-server/index.js` を実行。ユーザーにNode.js必須 |
| **B. Node.jsをバンドル** | ~40MB追加 | node バイナリを同梱。独立動作するがサイズ増 |
| **C. Bunでコンパイル** | ~50MB追加 | `bun build --compile` で単一バイナリ化 |

→ **推奨: 方式A**（AgentNestの対象ユーザーは開発者なのでNode.jsは前提でよい。サイズを最小に保てる）

### 4.4 設定永続化

**Electron**: `fs.readFileSync/writeFileSync` + `app.getPath("userData")`

**Tauri**: `tauri-plugin-store`

```rust
// tauri.conf.json で plugin-store を有効化
// フロントエンドから直接使える
```

```javascript
import { Store } from '@tauri-apps/plugin-store';
const store = await Store.load('config.json');
await store.set('baseProjectDir', '/path/to/dir');
await store.save();
```

### 4.5 自動更新 (GitHub Releases)

**Electron**: `electron-updater` + `gh-token.json` 埋め込み

**Tauri**: `tauri-plugin-updater`

```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/Junpeiwada/AgentNest/releases/latest/download/latest.json"
      ],
      "pubkey": "<更新署名の公開鍵>"
    }
  }
}
```

```javascript
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const update = await check();
if (update) {
  await update.downloadAndInstall();
  await relaunch();
}
```

**重要な違い**:
- Tauriは更新バイナリの**署名が必須**（`tauri signer generate` で鍵ペア生成）
- `GH_TOKEN`の埋め込みは不要（publicリポジトリならトークン不要）
- `latest.json` マニフェストが GitHub Release に自動アップロードされる

### 4.6 システムトレイ

**Electron**: `Tray` + `Menu` + SVG → `nativeImage`

**Tauri**: `tauri::tray::TrayIconBuilder`

```rust
use tauri::tray::{TrayIconBuilder, MenuBuilder, MenuItemBuilder};

TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .on_menu_event(|app, event| { ... })
    .build(app)?;
```

### 4.7 ディレクトリ選択ダイアログ

**Electron**: `dialog.showOpenDialog()`

**Tauri**: `tauri-plugin-dialog`

```javascript
import { open } from '@tauri-apps/plugin-dialog';
const dir = await open({ directory: true, title: 'プロジェクトフォルダを選択' });
```

### 4.8 ブラウザでURLを開く

**Electron**: `shell.openExternal(url)`

**Tauri**: `tauri-plugin-opener`

```javascript
import { openUrl } from '@tauri-apps/plugin-opener';
await openUrl(`http://localhost:${port}`);
```

### 4.9 ウィンドウ設定

**Electron** (`main.ts`):
```javascript
new BrowserWindow({
  width: 420, height: 560,
  titleBarStyle: "hiddenInset",
  trafficLightPosition: { x: 16, y: 18 },
  resizable: false,
});
```

**Tauri** (`tauri.conf.json`):
```json
{
  "app": {
    "windows": [{
      "title": "AgentNest",
      "width": 420,
      "height": 560,
      "resizable": false,
      "titleBarStyle": "Overlay",
      "hiddenTitle": true
    }]
  }
}
```

---

## 5. ファイル構成の変更

### 削除するもの
```
electron/              ← 全削除
├── main.ts
├── preload.ts
├── app.html
├── server-manager.ts
├── config-store.ts
├── updater.ts
├── tray.ts
├── tsconfig.json
└── icons/
```

### 新規作成するもの
```
src-tauri/
├── Cargo.toml                    ← Rust依存関係
├── tauri.conf.json               ← Tauri設定（ウィンドウ、プラグイン、更新）
├── build.rs                      ← ビルドスクリプト
├── icons/                        ← アプリアイコン（tauri icon コマンドで生成）
├── capabilities/
│   └── default.json              ← 権限設定
└── src/
    ├── main.rs                   ← エントリポイント
    ├── lib.rs                    ← Tauriコマンド定義（IPC相当）
    ├── server.rs                 ← サーバープロセス管理
    └── tray.rs                   ← トレイアイコン・メニュー

src/                              ← Tauriフロントエンド（設定パネル）
└── index.html                    ← app.html を移植（invoke()呼び出しに変更）
```

### 変更するもの
```
package.json           ← electron関連の依存・スクリプトを削除、tauri CLIを追加
scripts/release.sh     ← electron-builder → tauri build に変更
server/index.ts        ← 変更なし（fork IPC部分はそのまま残しても無害）
frontend/              ← 変更なし
```

---

## 6. 依存関係の変更

### 削除する npm パッケージ
```
dependencies:
  - electron-updater

devDependencies:
  - electron
  - electron-builder
```

### 追加するもの
```
devDependencies:
  + @tauri-apps/cli          ← Tauri CLIツール

# フロントエンド (設定パネルUIで使用)
  + @tauri-apps/api          ← invoke(), listen()
  + @tauri-apps/plugin-dialog   ← ディレクトリ選択
  + @tauri-apps/plugin-opener   ← ブラウザで開く
  + @tauri-apps/plugin-store    ← 設定永続化
  + @tauri-apps/plugin-updater  ← 自動更新
  + @tauri-apps/plugin-process  ← relaunch()
  + @tauri-apps/plugin-shell    ← サイドカー実行
```

### Rust (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
tauri-plugin-store = "2"
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

---

## 7. リリースフローの変更

### 現在 (Electron)
```
npm version patch
→ npm run build (frontend)
→ npm run electron:build (TypeScript → JS)
→ gh-token.json 埋め込み
→ npx electron-builder --mac --publish always
→ GitHub Releases にアップロード
```

### Tauri移行後
```
npm version patch
→ npm run build (frontend)
→ tauri build (Rustコンパイル + バンドル)
→ 署名付きバイナリ生成
→ GitHub Releases にアップロード（tauri-action または手動）
```

### GitHub Actions での自動ビルド（推奨）
```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && cd frontend && npm ci
      - run: npm run build
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          tagName: v__VERSION__
          releaseName: 'v__VERSION__'
```

---

## 8. 実装ステップ

### Phase 1: Tauri プロジェクト初期化
1. Rust ツールチェーンのインストール確認（`rustup`）
2. Tauri CLI インストール（`npm install -D @tauri-apps/cli`）
3. `npm run tauri init` でプロジェクト雛形生成
4. `tauri.conf.json` にウィンドウ設定・プラグイン設定を記述
5. アイコン生成（`npm run tauri icon build/icon_1024.png`）

### Phase 2: Rust バックエンド実装
1. **`lib.rs`**: Tauriコマンド定義（get_config, set_config, start_server, stop_server, get_server_status）
2. **`server.rs`**: `Command::new("node")` でExpressサーバーを起動・停止するロジック
3. **`tray.rs`**: システムトレイアイコンとコンテキストメニュー
4. **`main.rs`**: プラグイン登録、トレイ初期化、自動起動

### Phase 3: 設定パネル UI 移植
1. `electron/app.html` → `src/index.html` にコピー
2. `window.electronAPI.*` → `invoke()` / `listen()` に書き換え
3. `selectDirectory` → `@tauri-apps/plugin-dialog` の `open()` に変更
4. `openInBrowser` → `@tauri-apps/plugin-opener` の `openUrl()` に変更
5. 動作確認

### Phase 4: 自動更新の設定
1. `tauri signer generate` で署名キーペア生成
2. `tauri.conf.json` に updater endpoints と pubkey を設定
3. フロントエンドに更新チェック・インストールUIを実装
4. ローカルでビルド＆更新テスト

### Phase 5: ビルド・リリース整備
1. `scripts/release.sh` を Tauri 用に書き換え
2. package.json のスクリプトを更新
3. （任意）GitHub Actions ワークフロー作成
4. テストリリース実施

### Phase 6: クリーンアップ
1. `electron/` ディレクトリ削除
2. `dist-electron/` 削除
3. 不要な npm パッケージ削除（`electron`, `electron-builder`, `electron-updater`）
4. CLAUDE.md の開発コマンドセクション更新
5. README.md 更新

---

## 9. 開発コマンド（移行後）

```bash
# 開発（Tauri + Vite + Express 同時起動）
npm run tauri dev

# プロダクションビルド
npm run tauri build

# アイコン生成
npm run tauri icon build/icon_1024.png

# 署名キー生成（初回のみ）
npm run tauri signer generate

# リリース
npm run release
```

---

## 10. リスクと注意点

### サーバープロセス管理
- Electronでは `child_process.fork()` でIPC通信していたが、Tauriでは `Command::new()` で `spawn` する
- サーバーの `process.send({ type: "ready" })` は使えなくなるため、HTTP ヘルスチェック（`GET /api/status`）でサーバー起動完了を検知する方式に変更が必要

### Rust の学習コスト
- Tauriバックエンドは Rust で書く必要がある
- ただし AgentNest のバックエンドロジックは単純（プロセス起動/停止、設定読み書き、トレイメニュー）なので、Rust の高度な知識は不要

### macOS 固有
- `titleBarStyle: "Overlay"` は macOS では Electron の `hiddenInset` に相当
- `trafficLightPosition` の微調整はTauriのウィンドウAPIで可能（`setDecorations` 等）

### 自動更新の署名
- Tauriでは更新バイナリの署名が必須
- 秘密鍵はCI/CDのシークレットに保存し、ローカルビルドでは環境変数で渡す

### Node.js 前提
- サイドカー方式Aを選択した場合、ユーザーのマシンに Node.js が必要
- AgentNest の対象ユーザー（開発者）には問題ないが、README に明記する
