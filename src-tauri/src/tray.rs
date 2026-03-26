use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

use crate::server::SharedServerState;

fn build_menu(app: &AppHandle, running: bool, port: u16) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "AgentNest を表示", true, None::<&str>)?;
    let status_text = if running {
        format!("サーバー: 起動中 (ポート {})", port)
    } else {
        "サーバー: 停止中".to_string()
    };
    let status_item = MenuItem::with_id(app, "status", &status_text, false, None::<&str>)?;
    let start_item = MenuItem::with_id(app, "start", "サーバーを開始", !running, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "サーバーを停止", running, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &status_item,
            &start_item,
            &stop_item,
            &quit_item,
        ],
    )?;

    Ok(menu)
}

pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_menu(app, false, 3000)?;

    TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "start" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<SharedServerState>();
                        let cfg = crate::config::load_config(&app);
                        if let (Some(dir), port) = (cfg.base_project_dir, cfg.port) {
                            let result =
                                crate::server::start_server(&app, &state, &dir, port).await;
                            emit_status(&app, &state).await;
                            if let Err(e) = result {
                                eprintln!("Server start error: {}", e);
                            }
                        }
                    });
                }
                "stop" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<SharedServerState>();
                        let _ = crate::server::stop_server(&state).await;
                        emit_status(&app, &state).await;
                    });
                }
                "quit" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app.state::<SharedServerState>();
                        let _ = crate::server::stop_server(&state).await;
                        app.exit(0);
                    });
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

pub async fn emit_status(app: &AppHandle, state: &SharedServerState) {
    let s = state.lock().await;
    let status = s.status();
    let _ = app.emit("server-status-change", &status);

    // トレイメニューを再構築
    if let Some(tray) = app.tray_by_id("main") {
        if let Ok(menu) = build_menu(app, status.running, status.port) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}
