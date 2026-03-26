import { Tray, Menu, nativeImage, BrowserWindow, app } from "electron";
import { ServerManager } from "./server-manager";

let tray: Tray | null = null;

function createTrayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect x="2" y="3" width="12" height="10" rx="3" fill="white"/>
      <rect x="4.5" y="5.5" width="7" height="1.5" rx="0.75" fill="black"/>
      <rect x="4.5" y="8.5" width="4.5" height="1.5" rx="0.75" fill="black"/>
    </svg>
  `;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  );
  icon.setTemplateImage(true);
  return icon;
}

export function createTray(
  mainWindow: BrowserWindow,
  serverManager: ServerManager,
  callbacks: {
    onShowSettings: () => void;
    onStartServer: () => void;
    onStopServer: () => void;
  }
): Tray {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("ClaudeWeb");

  const updateMenu = () => {
    const running = serverManager.running;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "ClaudeWeb を表示",
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: "separator" },
      {
        label: running
          ? `サーバー: 起動中 (ポート ${serverManager.port})`
          : "サーバー: 停止中",
        enabled: false,
      },
      {
        label: "サーバーを開始",
        enabled: !running,
        click: callbacks.onStartServer,
      },
      {
        label: "サーバーを停止",
        enabled: running,
        click: callbacks.onStopServer,
      },
      { type: "separator" },
      {
        label: "設定...",
        click: callbacks.onShowSettings,
      },
      { type: "separator" },
      {
        label: "終了",
        click: () => {
          app.quit();
        },
      },
    ]);

    tray?.setContextMenu(contextMenu);
  };

  // 初回メニュー構築
  updateMenu();

  // サーバー状態変更時にメニュー更新
  serverManager.on("status-change", updateMenu);

  tray.on("click", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
