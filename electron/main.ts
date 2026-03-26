// Claude Code等がELECTRON_RUN_AS_NODEを設定するとElectronがNode.jsモードになるため除去
delete process.env.ELECTRON_RUN_AS_NODE;

import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu } from "electron";
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
  // アプリアイコンを設定（Aboutパネルにも反映される）
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "build", "icon_1024.png")
    : path.join(__dirname, "..", "build", "icon_1024.png");
  try {
    const appIcon = nativeImage.createFromPath(iconPath);
    if (!appIcon.isEmpty()) {
      app.dock?.setIcon(appIcon);
    }
  } catch {
    // アイコンが無い場合は無視
  }

  // Aboutパネル設定
  app.setAboutPanelOptions({
    applicationName: "AgentNest",
    applicationVersion: app.getVersion(),
    copyright: "Copyright (c) 2026 Junpei Wada",
    credits: "ブラウザからClaude Codeを操作するWebインターフェース",
  });

  // アプリケーションメニュー
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: "AgentNest について" },
        { type: "separator" },
        { role: "hide", label: "AgentNest を隠す" },
        { role: "hideOthers", label: "ほかを隠す" },
        { role: "unhide", label: "すべてを表示" },
        { type: "separator" },
        { role: "quit", label: "AgentNest を終了" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { role: "undo", label: "取り消す" },
        { role: "redo", label: "やり直す" },
        { type: "separator" },
        { role: "cut", label: "カット" },
        { role: "copy", label: "コピー" },
        { role: "paste", label: "ペースト" },
        { role: "selectAll", label: "すべてを選択" },
      ],
    },
    {
      label: "ウインドウ",
      submenu: [
        { role: "minimize", label: "しまう" },
        { role: "close", label: "閉じる" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

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
