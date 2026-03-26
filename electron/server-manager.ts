import { fork, ChildProcess } from "child_process";
import path from "path";
import { EventEmitter } from "events";

export interface ServerStatus {
  running: boolean;
  port: number;
  error?: string;
}

export class ServerManager extends EventEmitter {
  private serverProcess: ChildProcess | null = null;
  private _port: number = 3000;
  private _running: boolean = false;
  private _stopping: boolean = false;

  get running(): boolean {
    return this._running;
  }

  get port(): number {
    return this._port;
  }

  private _lastError: string | undefined;

  getStatus(): ServerStatus {
    return { running: this._running, port: this._port, error: this._lastError };
  }

  start(baseDir: string, port: number, appRoot: string): Promise<void> {
    if (this.serverProcess) {
      return Promise.reject(new Error("Server is already running"));
    }

    this._port = port;
    this._stopping = false;
    this._lastError = undefined;

    return new Promise((resolve, reject) => {
      let settled = false;
      const isAsar = appRoot.endsWith(".asar");

      // パッケージ版: コンパイル済みJS、開発版: tsx経由でTS実行
      const serverEntry = isAsar
        ? path.join(appRoot, "dist-server", "index.js")
        : path.join(appRoot, "server", "index.ts");
      const tsxLoader = isAsar
        ? undefined
        : path.join(appRoot, "node_modules", "tsx", "dist", "loader.mjs");
      const cwd = isAsar ? process.resourcesPath : appRoot;

      this.serverProcess = fork(serverEntry, [], {
        execArgv: tsxLoader ? ["--import", tsxLoader] : [],
        env: {
          ...process.env,
          BASE_PROJECT_DIR: baseDir,
          PORT: String(port),
        },
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        cwd,
      });

      const timeout = setTimeout(() => {
        settled = true;
        reject(new Error("Server start timeout"));
        this.stop();
      }, 15000);

      this.serverProcess.on("message", (msg: unknown) => {
        const message = msg as { type: string; port?: number; message?: string };
        if (message.type === "ready") {
          settled = true;
          clearTimeout(timeout);
          this._running = true;
          this.emit("status-change", this.getStatus());
          resolve();
        } else if (message.type === "error") {
          this._lastError = message.message || "Server error";
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(this._lastError));
          }
        }
      });

      this.serverProcess.on("error", (err) => {
        clearTimeout(timeout);
        this._running = false;
        this.serverProcess = null;
        this.emit("status-change", this.getStatus());
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      this.serverProcess.on("exit", (code) => {
        clearTimeout(timeout);
        this._running = false;
        this.serverProcess = null;
        // 異常終了時、IPCエラーが無ければ汎用メッセージを設定
        if (code !== 0 && code !== null && code !== 143 && !this._stopping && !this._lastError) {
          this._lastError = `サーバーが異常終了しました (code: ${code})`;
        }
        this.emit("status-change", this.getStatus());
        if (!settled && !this._stopping) {
          settled = true;
          reject(new Error(this._lastError || `Server exited before ready (code: ${code ?? "unknown"})`));
        }
        if (code !== 0 && code !== null && code !== 143 && !this._stopping) {
          this.emit("error", new Error(`Server exited with code ${code}`));
        }
      });

      // サーバーのstdout/stderrをメインプロセスのコンソールに転送
      this.serverProcess.stdout?.on("data", (data: Buffer) => {
        console.log(`[server] ${data.toString().trim()}`);
      });
      this.serverProcess.stderr?.on("data", (data: Buffer) => {
        console.error(`[server] ${data.toString().trim()}`);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.serverProcess) {
        this._running = false;
        resolve();
        return;
      }

      this._stopping = true;

      const proc = this.serverProcess;

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        this._running = false;
        this._stopping = false;
        this.serverProcess = null;
        this.emit("status-change", this.getStatus());
        resolve();
      }, 5000);

      proc.on("exit", () => {
        clearTimeout(timeout);
        this._running = false;
        this._stopping = false;
        this.serverProcess = null;
        this.emit("status-change", this.getStatus());
        resolve();
      });

      proc.kill("SIGTERM");
    });
  }

  async restart(baseDir: string, port: number, appRoot: string): Promise<void> {
    await this.stop();
    await this.start(baseDir, port, appRoot);
  }
}
