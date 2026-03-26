import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true as const,

  // 設定
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke("set-config", config),

  // フォルダ選択
  selectDirectory: () => ipcRenderer.invoke("select-directory"),

  // サーバー制御
  getServerStatus: () => ipcRenderer.invoke("get-server-status"),
  startServer: () => ipcRenderer.invoke("start-server"),
  stopServer: () => ipcRenderer.invoke("stop-server"),

  // ブラウザで開く
  openInBrowser: (url: string) => ipcRenderer.invoke("open-in-browser", url),

  // サーバー状態変更リスナー
  onServerStatusChange: (callback: (status: { running: boolean; port: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: { running: boolean; port: number }) => {
      callback(status);
    };
    ipcRenderer.on("server-status-change", handler);
    return () => {
      ipcRenderer.removeListener("server-status-change", handler);
    };
  },
});
