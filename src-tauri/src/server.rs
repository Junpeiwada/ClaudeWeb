use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct ServerState {
    process: Option<Child>,
    port: u16,
    running: bool,
    last_error: Option<String>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            process: None,
            port: 3000,
            running: false,
            last_error: None,
        }
    }

    pub fn status(&self) -> ServerStatus {
        ServerStatus {
            running: self.running,
            port: self.port,
            error: self.last_error.clone(),
        }
    }
}

pub type SharedServerState = Arc<Mutex<ServerState>>;

pub fn new_shared_state() -> SharedServerState {
    Arc::new(Mutex::new(ServerState::new()))
}

/// サーバーの起動完了をHTTPヘルスチェックで待つ
async fn wait_for_server(port: u16, timeout_secs: u64) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/api/status", port);
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    loop {
        if start.elapsed() > timeout {
            return Err("サーバー起動タイムアウト（15秒）".to_string());
        }

        // シンプルにTCP接続チェック
        if let Ok(_stream) =
            tokio::net::TcpStream::connect(format!("127.0.0.1:{}", port)).await
        {
            // 接続可能になったらHTTPでヘルスチェック
            match reqwest::get(&url).await {
                Ok(resp) if resp.status().is_success() => return Ok(()),
                _ => {}
            }
        }

        sleep(Duration::from_millis(300)).await;
    }
}

/// `server/index.ts` を含むプロジェクトルートを探す
fn find_project_root(start: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut dir = start.to_path_buf();
    for _ in 0..10 {
        if dir.join("server").join("index.ts").exists() {
            return Some(dir);
        }
        if dir.join("dist-server").join("index.js").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// サーバーのルートパスを決定する
fn get_server_root(app: &AppHandle) -> std::path::PathBuf {
    // 1. 実行バイナリの位置から上方向に探索
    //    dev: src-tauri/target/release/agent-nest → 3つ上がプロジェクトルート
    //    bundle: AgentNest.app/Contents/MacOS/agent-nest → appの外を探索
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            if let Some(root) = find_project_root(exe_dir) {
                return root;
            }
        }
    }

    // 2. resource_dir から探索
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(root) = find_project_root(&resource_dir) {
            return root;
        }
    }

    // 3. カレントディレクトリ
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(root) = find_project_root(&cwd) {
            return root;
        }
    }

    // フォールバック
    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("/"))
}

pub async fn start_server(
    app: &AppHandle,
    state: &SharedServerState,
    base_dir: &str,
    port: u16,
) -> Result<(), String> {
    let mut s = state.lock().await;

    if s.running {
        return Err("サーバーは既に起動しています".to_string());
    }

    s.port = port;
    s.last_error = None;

    let app_root = get_server_root(app);
    let server_entry = app_root.join("server").join("index.ts");
    let dist_server_entry = app_root.join("dist-server").join("index.js");

    // 開発時はtsx（node_modules/.bin/tsx）、パッケージ版はnodeを使用
    let local_tsx = app_root.join("node_modules").join(".bin").join("tsx");
    let (cmd, args) = if server_entry.exists() {
        let tsx_cmd = if local_tsx.exists() {
            local_tsx.to_string_lossy().to_string()
        } else {
            "tsx".to_string() // PATHにあれば使う
        };
        (tsx_cmd, vec![server_entry.to_string_lossy().to_string()])
    } else if dist_server_entry.exists() {
        ("node".to_string(), vec![dist_server_entry.to_string_lossy().to_string()])
    } else {
        return Err(format!(
            "サーバーエントリが見つかりません: {} or {}",
            server_entry.display(),
            dist_server_entry.display()
        ));
    };

    let child = Command::new(&cmd)
        .args(&args)
        .env("BASE_PROJECT_DIR", base_dir)
        .env("PORT", port.to_string())
        .current_dir(&app_root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("サーバー起動失敗: {} — コマンド: {} {:?}", e, cmd, args))?;

    s.process = Some(child);
    drop(s); // ロック解放してからヘルスチェック

    // ヘルスチェックでサーバー起動を待つ
    match wait_for_server(port, 15).await {
        Ok(()) => {
            let mut s = state.lock().await;
            s.running = true;
            Ok(())
        }
        Err(e) => {
            // タイムアウト: プロセス停止
            let mut s = state.lock().await;
            if let Some(mut child) = s.process.take() {
                let _ = child.kill().await;
            }
            s.running = false;
            s.last_error = Some(e.clone());
            Err(e)
        }
    }
}

pub async fn stop_server(state: &SharedServerState) -> Result<(), String> {
    let mut s = state.lock().await;

    if let Some(mut child) = s.process.take() {
        // まずSIGTERMで優しく停止
        let _ = child.kill().await;
        s.running = false;
        s.last_error = None;
        Ok(())
    } else {
        s.running = false;
        Ok(())
    }
}
