// Claude Code等がELECTRON_RUN_AS_NODEを設定するとElectronがNode.jsモードになるため除去
delete process.env.ELECTRON_RUN_AS_NODE;

import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from "electron";
import path from "path";
import { getConfig, setConfig } from "./config-store";
import { ServerManager } from "./server-manager";
import { createTray, destroyTray } from "./tray";

const serverManager = new ServerManager();
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

function getAppRoot(): string {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.join(__dirname, "..");
}

function createWindow(): BrowserWindow {
  const config = getConfig();

  const win = new BrowserWindow({
    width: 420,
    height: 560,
    x: config.windowBounds?.x,
    y: config.windowBounds?.y,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 常にコントロールパネルを表示
  win.loadFile(path.join(__dirname, "app.html"));

  // ウィンドウを閉じてもトレイに残す
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // ウィンドウ位置を記憶
  win.on("moved", () => saveWindowBounds(win));

  return win;
}

function saveWindowBounds(win: BrowserWindow): void {
  const bounds = win.getBounds();
  setConfig({ windowBounds: bounds });
}

async function startServer(): Promise<void> {
  const config = getConfig();
  if (!config.baseProjectDir) {
    throw new Error("プロジェクトフォルダが設定されていません");
  }
  await serverManager.start(config.baseProjectDir, config.port, getAppRoot());
}

// === IPC Handlers ===

function registerIpcHandlers(): void {
  ipcMain.handle("get-config", () => {
    const config = getConfig();
    return {
      baseProjectDir: config.baseProjectDir,
      port: config.port,
      autoStartServer: config.autoStartServer,
    };
  });

  ipcMain.handle("set-config", (_event, partial: Record<string, unknown>) => {
    setConfig(partial);
  });

  ipcMain.handle("select-directory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "プロジェクトフォルダを選択",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("get-server-status", () => {
    return serverManager.getStatus();
  });

  ipcMain.handle("start-server", async () => {
    await startServer();
  });

  ipcMain.handle("stop-server", async () => {
    await serverManager.stop();
  });

  ipcMain.handle("open-in-browser", (_event, url: string) => {
    shell.openExternal(url);
  });
}

// === App Lifecycle ===

app.whenReady().then(async () => {
  // 開発時のDockアイコンを設定（パッケージ版はelectron-builderが.icnsを適用）
  if (!app.isPackaged) {
    const iconPath = path.join(__dirname, "..", "build", "icon_1024.png");
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock?.setIcon(dockIcon);
      }
    } catch {
      // アイコンが無い場合は無視
    }
  }

  registerIpcHandlers();

  mainWindow = createWindow();

  // サーバー状態変更をレンダラーに通知
  serverManager.on("status-change", (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("server-status-change", status);
    }
  });

  // サーバーエラーをハンドル（未処理だとUncaught Exceptionになる）
  serverManager.on("error", (err) => {
    console.error("Server error:", err.message);
  });

  // トレイアイコン作成
  createTray(mainWindow, serverManager, {
    onShowSettings: () => {
      mainWindow?.show();
      mainWindow?.focus();
    },
    onStartServer: async () => {
      try {
        await startServer();
      } catch (err) {
        console.error("Failed to start server:", err);
      }
    },
    onStopServer: async () => {
      await serverManager.stop();
    },
  });

  // サーバー自動起動
  const config = getConfig();
  if (config.autoStartServer && config.baseProjectDir) {
    try {
      await startServer();
    } catch (err) {
      console.error("Failed to auto-start server:", err);
    }
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  destroyTray();
  // サーバーを停止（完了を待たずにプロセス終了してもOK）
  serverManager.stop().catch(() => {});
});

app.on("activate", () => {
  mainWindow?.show();
  mainWindow?.focus();
});

// macOSでは全ウィンドウ閉じてもアプリを終了しない
app.on("window-all-closed", () => {
  // do nothing on macOS
});
