mod config;
mod server;

use config::AppConfig;
use server::{ServerStatus, SharedServerState};
use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State};

async fn emit_status(app: &AppHandle, state: &SharedServerState) {
    let s = state.lock().await;
    let status = s.status();
    drop(s);
    let _ = app.emit("server-status-change", &status);
}

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    config::load_config(&app)
}

#[tauri::command]
fn set_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    config::save_config(&app, &config)
}

#[tauri::command]
fn get_server_status(state: State<SharedServerState>) -> ServerStatus {
    // 同期的にtry_lockで取得
    match state.try_lock() {
        Ok(s) => s.status(),
        Err(_) => ServerStatus {
            running: false,
            port: 3000,
            error: None,
        },
    }
}

#[tauri::command]
async fn start_server(app: AppHandle, state: State<'_, SharedServerState>) -> Result<(), String> {
    let cfg = config::load_config(&app);
    let base_dir = cfg
        .base_project_dir
        .ok_or("プロジェクトフォルダが設定されていません")?;
    let port = cfg.port;

    server::start_server(&app, &state, &base_dir, port).await?;
    emit_status(&app, &state).await;
    Ok(())
}

#[tauri::command]
async fn stop_server(app: AppHandle, state: State<'_, SharedServerState>) -> Result<(), String> {
    server::stop_server(&state).await?;
    emit_status(&app, &state).await;
    Ok(())
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .manage(server::new_shared_state())
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            get_server_status,
            start_server,
            stop_server,
            get_app_version,
        ])
        .setup(|app| {
            // macOS About ダイアログにライセンス情報を表示
            let credits = [
                "Open Source Licenses",
                "",
                "Tauri — MIT / Apache-2.0",
                "React — MIT",
                "Material UI (MUI) — MIT",
                "Emotion — MIT",
                "Express — MIT",
                "React Router — MIT",
                "react-markdown — MIT",
                "remark-gfm — MIT",
                "@uiw/react-md-editor — MIT",
                "@anthropic-ai/claude-agent-sdk — see package license",
                "Vite — MIT",
                "serde — MIT / Apache-2.0",
                "tokio — MIT",
                "reqwest — MIT / Apache-2.0",
            ]
            .join("\n");

            let about_metadata = AboutMetadata {
                name: Some("AgentNest".into()),
                version: Some(app.package_info().version.to_string()),
                copyright: Some("© 2025 Junpei Wada".into()),
                credits: Some(credits),
                ..Default::default()
            };

            let app_submenu = SubmenuBuilder::new(app, "AgentNest")
                .about(Some(about_metadata))
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let menu = MenuBuilder::new(app).item(&app_submenu).build()?;
            app.set_menu(menu)?;

            // 保存済みウィンドウ位置を復元
            let cfg = config::load_config(app.handle());
            if let Some(bounds) = &cfg.window_bounds {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_position(tauri::Position::Physical(
                        tauri::PhysicalPosition::new(bounds.x, bounds.y),
                    ));
                }
            }

            // macOS: Dockアイコンで操作
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }

            // サーバー自動起動
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let cfg = config::load_config(&app_handle);
                if cfg.auto_start_server && cfg.base_project_dir.is_some() {
                    let state = app_handle.state::<SharedServerState>();
                    let base_dir = cfg.base_project_dir.unwrap();
                    let port = cfg.port;
                    match server::start_server(&app_handle, &state, &base_dir, port).await {
                        Ok(()) => {
                            emit_status(&app_handle, &state).await;
                            // macOS アクセス許可ダイアログをアプリ起動時に即時表示するため
                            // サーバー起動直後にリポジトリ一覧を取得する
                            let url = format!("http://127.0.0.1:{}/api/repos", port);
                            let _ = reqwest::get(&url).await;
                        }
                        Err(e) => {
                            eprintln!("自動起動失敗: {}", e);
                            emit_status(&app_handle, &state).await;
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // ウィンドウ位置を保存してからhide
                    if let Ok(pos) = window.outer_position() {
                        if let Ok(size) = window.outer_size() {
                            let app = window.app_handle();
                            let mut cfg = config::load_config(app);
                            cfg.window_bounds = Some(config::WindowBounds {
                                x: pos.x,
                                y: pos.y,
                                width: size.width,
                                height: size.height,
                            });
                            let _ = config::save_config(app, &cfg);
                        }
                    }
                    api.prevent_close();
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match &event {
                tauri::RunEvent::ExitRequested { ref api, code, .. } => {
                    if code.is_none() {
                        // ウィンドウが全て閉じた時のみ終了を防ぐ（バックグラウンドでサーバー常駐）
                        // code が Some の場合は app.exit() からの明示的終了なので通す
                        api.prevent_exit();
                    }
                }
                tauri::RunEvent::Exit => {
                    // アプリ終了時にサーバーを確実に停止
                    let state = app.state::<SharedServerState>();
                    tauri::async_runtime::block_on(async {
                        let _ = server::stop_server(&state).await;
                    });
                }
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                _ => {}
            }
        });
}
