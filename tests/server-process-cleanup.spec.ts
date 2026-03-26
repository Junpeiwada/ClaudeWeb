import { test, expect } from "@playwright/test";
import { spawn, execSync } from "child_process";
import path from "path";

/**
 * サーバープロセス停止テスト
 *
 * tsx が起動する node 孫プロセスも含め、サーバー停止時に
 * すべてのプロセスがクリーンアップされることを検証する。
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const TSX_BIN = path.join(PROJECT_ROOT, "node_modules/.bin/tsx");
const SERVER_ENTRY = path.join(PROJECT_ROOT, "server/index.ts");
const TEST_PORT = 13579; // テスト用ポート（他と衝突しない番号）

/** 指定ポートでLISTEN中のPID一覧を返す */
function getPidsOnPort(port: number): number[] {
  try {
    const out = execSync(
      `lsof -i :${port} -sTCP:LISTEN -Fp 2>/dev/null`,
      { encoding: "utf-8" }
    );
    return [...out.matchAll(/^p(\d+)$/gm)].map((m) => Number(m[1]));
  } catch {
    return [];
  }
}

/** ポートが使えるようになるまで待つ */
async function waitForPortFree(port: number, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getPidsOnPort(port).length === 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** ポートがLISTEN状態になるまで待つ */
async function waitForPortListening(port: number, timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getPidsOnPort(port).length > 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

test.describe("サーバープロセスのクリーンアップ", () => {
  test("tsx プロセスを SIGTERM で停止すると、ポートが解放される", async () => {
    // 前提: テストポートが空いていること
    const preCheck = getPidsOnPort(TEST_PORT);
    expect(preCheck, `ポート ${TEST_PORT} が既に使用されています`).toHaveLength(0);

    // サーバーを起動
    const child = spawn(TSX_BIN, [SERVER_ENTRY], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        BASE_PROJECT_DIR: "/tmp",
      },
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    });

    try {
      // サーバーがLISTEN状態になるのを待つ
      const listening = await waitForPortListening(TEST_PORT);
      expect(listening, "サーバーが起動しませんでした").toBe(true);

      // LISTEN中のPIDを記録
      const pidsWhileRunning = getPidsOnPort(TEST_PORT);
      expect(pidsWhileRunning.length).toBeGreaterThan(0);

      // tsx プロセスに SIGTERM を送信
      child.kill("SIGTERM");

      // ポートが解放されるのを待つ
      const freed = await waitForPortFree(TEST_PORT);

      // 残っているPIDを確認
      const pidsAfterKill = getPidsOnPort(TEST_PORT);
      expect(
        pidsAfterKill,
        `サーバー停止後もプロセスが残っています: PIDs=${pidsAfterKill.join(", ")}`
      ).toHaveLength(0);
      expect(freed).toBe(true);
    } finally {
      // テスト失敗時のクリーンアップ: 残っているプロセスを強制終了
      child.kill("SIGKILL");
      const remaining = getPidsOnPort(TEST_PORT);
      for (const pid of remaining) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    }
  });

  test("プロセスグループ kill で tsx + node 孫プロセスがすべて停止する", async () => {
    const preCheck = getPidsOnPort(TEST_PORT);
    expect(preCheck, `ポート ${TEST_PORT} が既に使用されています`).toHaveLength(0);

    // detached: true で新しいプロセスグループとして起動（Rust側の setpgid 相当）
    const child = spawn(TSX_BIN, [SERVER_ENTRY], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        BASE_PROJECT_DIR: "/tmp",
      },
      cwd: PROJECT_ROOT,
      stdio: "pipe",
      detached: true,
    });

    try {
      const listening = await waitForPortListening(TEST_PORT);
      expect(listening, "サーバーが起動しませんでした").toBe(true);

      const pidsWhileRunning = getPidsOnPort(TEST_PORT);
      expect(pidsWhileRunning.length).toBeGreaterThan(0);

      // プロセスグループ全体に SIGTERM を送信（Rust側の kill(-pgid, SIGTERM) 相当）
      // child.pid がプロセスグループリーダーなので、-pid でグループ全体に送れる
      process.kill(-child.pid!, "SIGTERM");

      const freed = await waitForPortFree(TEST_PORT);

      const pidsAfterKill = getPidsOnPort(TEST_PORT);
      expect(
        pidsAfterKill,
        `プロセスグループkill後もプロセスが残っています: PIDs=${pidsAfterKill.join(", ")}`
      ).toHaveLength(0);
      expect(freed).toBe(true);
    } finally {
      try { process.kill(-child.pid!, "SIGKILL"); } catch {}
      const remaining = getPidsOnPort(TEST_PORT);
      for (const pid of remaining) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    }
  });
});
