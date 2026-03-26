import { autoUpdater } from "electron-updater";
import { app, BrowserWindow, ipcMain } from "electron";
import { setIsQuitting } from "./main";
import path from "path";
import fs from "fs";

type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "up-to-date" }
  | { state: "error"; message: string };

let updateStatus: UpdateStatus = { state: "idle" };
let initialized = false;

function getGhToken(): string {
  try {
    const tokenPath = path.join(__dirname, "gh-token.json");
    const data = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
    return data.token || "";
  } catch {
    return "";
  }
}

function notifyRenderer(): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("update-status-change", updateStatus);
    }
  });
}

function ensureInitialized(): boolean {
  if (initialized) return true;

  const ghToken = getGhToken();
  if (!ghToken) {
    console.log("GH_TOKENが未設定のため自動更新を無効化");
    return false;
  }

  process.env["GH_TOKEN"] = ghToken;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    updateStatus = { state: "checking" };
    notifyRenderer();
  });

  autoUpdater.on("update-available", (info) => {
    updateStatus = { state: "available", version: info.version };
    notifyRenderer();
  });

  autoUpdater.on("download-progress", (progress) => {
    updateStatus = { state: "downloading", percent: Math.round(progress.percent) };
    notifyRenderer();
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateStatus = { state: "downloaded", version: info.version };
    notifyRenderer();
  });

  autoUpdater.on("update-not-available", () => {
    updateStatus = { state: "up-to-date" };
    notifyRenderer();
  });

  autoUpdater.on("error", (err) => {
    updateStatus = { state: "error", message: err.message };
    notifyRenderer();
    console.error("自動更新エラー:", err.message);
  });

  initialized = true;
  return true;
}

/** IPCハンドラーを登録（パッケージ版でなくても常に登録） */
export function registerUpdaterHandlers(): void {
  ipcMain.handle("get-app-version", () => app.getVersion());

  ipcMain.handle("check-for-update", async () => {
    if (!app.isPackaged) {
      return { state: "error", message: "開発モードでは更新チェックできません" };
    }
    if (!ensureInitialized()) {
      return { state: "error", message: "GH_TOKENが未設定です" };
    }
    try {
      updateStatus = { state: "checking" };
      notifyRenderer();
      await autoUpdater.checkForUpdates();
      return updateStatus;
    } catch (err) {
      updateStatus = { state: "error", message: String(err) };
      notifyRenderer();
      return updateStatus;
    }
  });

  ipcMain.handle("install-update", () => {
    setIsQuitting();
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("get-update-status", () => updateStatus);
}

/** 自動更新を初期化（パッケージ版のみ） */
export function initializeAutoUpdater(): void {
  if (!app.isPackaged) return;
  if (!ensureInitialized()) return;

  autoUpdater.checkForUpdates().catch((err) => {
    console.error("更新チェック失敗:", err.message);
  });
}
