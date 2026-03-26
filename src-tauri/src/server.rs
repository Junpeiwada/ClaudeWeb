use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::io::AsyncReadExt;
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
    /// プロセスグループID（子プロセスツリー全体のkillに使用）
    pgid: Option<u32>,
    port: u16,
    running: bool,
    last_error: Option<String>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            process: None,
            pgid: None,
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
/// サーバーエントリポイント（dist-server/index.js または server/index.ts）を探す
fn find_server_entry(base: &std::path::Path) -> Option<std::path::PathBuf> {
    // バンドル済みJS（本番）を優先
    let dist = base.join("dist-server").join("index.js");
    if dist.exists() {
        return Some(dist);
    }
    // 開発用TS
    let dev = base.join("server").join("index.ts");
    if dev.exists() {
        return Some(dev);
    }
    None
}

/// サーバーエントリポイントのパスを決定する
fn get_server_entry(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // 1. Tauri Resources ディレクトリ（バンドル版: .app/Contents/Resources/dist-server/）
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(entry) = find_server_entry(&resource_dir) {
            return Ok(entry);
        }
    }

    // 2. 実行バイナリから上方向に探索（開発時: src-tauri/target/*/agent-nest）
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.clone();
        for _ in 0..10 {
            if !dir.pop() {
                break;
            }
            if let Some(entry) = find_server_entry(&dir) {
                return Ok(entry);
            }
        }
    }

    // 3. カレントディレクトリ
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(entry) = find_server_entry(&cwd) {
            return Ok(entry);
        }
    }

    Err("サーバーエントリが見つかりません（dist-server/index.js または server/index.ts）".to_string())
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

    let entry = get_server_entry(app)?;
    let entry_str = entry.to_string_lossy().to_string();
    let entry_dir = entry.parent().unwrap().to_path_buf();

    // .ts → tsx で実行（開発）、.js → node で実行（バンドル版）
    let is_ts = entry_str.ends_with(".ts");
    let (cmd, args) = if is_ts {
        // 開発時: ローカルtsx → PATHのtsx
        let project_root = entry_dir.parent().unwrap_or(&entry_dir);
        let local_tsx = project_root.join("node_modules").join(".bin").join("tsx");
        let tsx_cmd = if local_tsx.exists() {
            local_tsx.to_string_lossy().to_string()
        } else {
            "tsx".to_string()
        };
        (tsx_cmd, vec![entry_str.clone()])
    } else {
        ("node".to_string(), vec![entry_str.clone()])
    };

    // macOSアプリバンドルから起動時はPATHが最小限のため、
    // node等が見つかるようにPATHを補完する
    let path_env = {
        let system_path = std::env::var("PATH").unwrap_or_default();
        let mut extra_paths: Vec<String> = Vec::new();
        let home = std::env::var("HOME").unwrap_or_default();

        // nvm のNode.jsバイナリ
        let nvm_base = std::path::Path::new(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_base) {
            for entry in entries.flatten() {
                let bin = entry.path().join("bin");
                if bin.exists() {
                    extra_paths.push(bin.to_string_lossy().to_string());
                }
            }
        }

        // Homebrew
        for p in ["/opt/homebrew/bin", "/usr/local/bin"] {
            if std::path::Path::new(p).exists() {
                extra_paths.push(p.to_string());
            }
        }

        if extra_paths.is_empty() {
            system_path
        } else {
            extra_paths.push(system_path);
            extra_paths.join(":")
        }
    };

    // バンドル版の場合、NODE_PATH を設定してnode_modules内のSDKを解決
    let node_path = if !is_ts {
        Some(entry_dir.join("node_modules").to_string_lossy().to_string())
    } else {
        None
    };

    let working_dir = if is_ts {
        entry_dir.parent().unwrap_or(&entry_dir).to_path_buf()
    } else {
        entry_dir.clone()
    };

    let mut command = Command::new(&cmd);
    command
        .args(&args)
        .env("BASE_PROJECT_DIR", base_dir)
        .env("PORT", port.to_string())
        .env("PATH", &path_env)
        .current_dir(&working_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(np) = &node_path {
        command.env("NODE_PATH", np);
    }

    // 新しいプロセスグループを作成し、子プロセスツリー全体をkillできるようにする
    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("サーバー起動失敗: {} — コマンド: {} {:?}", e, cmd, args))?;

    // stderrをバックグラウンドで収集（タイムアウト時のエラー詳細に使用）
    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    if let Some(mut stderr) = child.stderr.take() {
        let buf = Arc::clone(&stderr_buf);
        tokio::spawn(async move {
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s).await;
            *buf.lock().await = s;
        });
    }

    let pgid = child.id();
    s.process = Some(child);
    s.pgid = pgid;
    drop(s); // ロック解放してからヘルスチェック

    // ヘルスチェックでサーバー起動を待つ
    match wait_for_server(port, 15).await {
        Ok(()) => {
            let mut s = state.lock().await;
            s.running = true;
            Ok(())
        }
        Err(_) => {
            // タイムアウト: stderrを収集してからプロセスグループごと停止
            sleep(Duration::from_millis(200)).await; // stderrが届くのを少し待つ
            let stderr_output = stderr_buf.lock().await.clone();
            let error_msg = if stderr_output.is_empty() {
                format!("サーバー起動タイムアウト（15秒）\nコマンド: {} {:?}\n作業Dir: {}", cmd, args, working_dir.display())
            } else {
                format!("サーバー起動タイムアウト（15秒）\nコマンド: {} {:?}\n作業Dir: {}\nエラー出力:\n{}", cmd, args, working_dir.display(), stderr_output)
            };

            let mut s = state.lock().await;
            #[cfg(unix)]
            if let Some(pgid) = s.pgid.take() {
                unsafe {
                    libc::kill(-(pgid as i32), libc::SIGTERM);
                }
            }
            if let Some(mut child) = s.process.take() {
                let _ = child.kill().await;
            }
            s.running = false;
            s.last_error = Some(error_msg.clone());
            Err(error_msg)
        }
    }
}

/// プロセスグループ全体にシグナルを送信してサーバーを停止する
pub async fn stop_server(state: &SharedServerState) -> Result<(), String> {
    let mut s = state.lock().await;

    // プロセスグループ全体にSIGTERMを送信（tsx + node 等すべて停止）
    #[cfg(unix)]
    if let Some(pgid) = s.pgid.take() {
        unsafe {
            libc::kill(-(pgid as i32), libc::SIGTERM);
        }
    }

    if let Some(mut child) = s.process.take() {
        // フォールバック: プロセスグループkillが効かなかった場合に備えて直接kill
        let _ = child.kill().await;
    }

    s.running = false;
    s.last_error = None;
    Ok(())
}
