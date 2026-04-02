import { Router } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync } from "fs";
import { BASE_DIR } from "../config.js";

const execFileAsync = promisify(execFile);

const router = Router();

// リポジトリパスの解決と .git 存在チェック
function resolveRepo(repoId: string): string {
  const repoPath = path.join(BASE_DIR, repoId);
  if (!existsSync(path.join(repoPath, ".git"))) {
    throw new Error("このディレクトリはGitリポジトリではありません。");
  }
  return repoPath;
}

// ファイルパスのバリデーション
function validateFilePath(filePath: string): void {
  if (filePath.includes("..")) {
    throw new Error("不正なファイルパスです。");
  }
}

// git コマンド実行ヘルパー
async function git(cwd: string, args: string[], timeoutMs = 10000): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });
  return stdout;
}

// GET /api/repos/:repoId/git/status
// ブランチ名、変更ファイル一覧、ahead/behind 数を取得
router.get("/api/repos/:repoId/git/status", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);

    // ブランチ名
    const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();

    // ahead/behind（リモート追跡ブランチがある場合のみ）
    let ahead = 0;
    let behind = 0;
    try {
      const revList = (await git(cwd, [
        "rev-list", "--left-right", "--count", `${branch}...origin/${branch}`,
      ])).trim();
      const parts = revList.split(/\s+/);
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    } catch {
      // リモート追跡ブランチがない場合は 0/0
    }

    // 変更ファイル一覧（ステージ済み + ワーキングツリー + 未追跡）
    const porcelain = await git(cwd, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-uall"]);
    const files: Array<{ path: string; status: string; staged: boolean }> = [];

    for (const line of porcelain.split("\n")) {
      if (!line) continue;
      const indexStatus = line[0];  // ステージ領域の状態
      const workStatus = line[1];   // ワーキングツリーの状態
      const filePath = line.slice(3).trim();
      // リネームの場合 "R  old -> new" 形式
      const displayPath = filePath.includes(" -> ") ? filePath.split(" -> ")[1] : filePath;

      if (indexStatus === "?" && workStatus === "?") {
        // 未追跡ファイル
        files.push({ path: displayPath, status: "?", staged: false });
      } else if (indexStatus !== " " && indexStatus !== "?") {
        // ステージ済みの変更
        files.push({ path: displayPath, status: indexStatus, staged: true });
      } else if (workStatus !== " ") {
        // ワーキングツリーの変更（未ステージ）
        files.push({ path: displayPath, status: workStatus, staged: false });
      }
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    res.json({ branch, ahead, behind, files });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/repos/:repoId/git/diff?file=<path>
// 指定ファイルの unified diff を取得
router.get("/api/repos/:repoId/git/diff", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    const file = req.query.file as string;
    if (!file) {
      res.status(400).json({ success: false, error: "file パラメータが必要です。" });
      return;
    }
    validateFilePath(file);

    // まずステージ済みの diff を試行、なければワーキングツリーの diff
    let diff = "";
    try {
      diff = await git(cwd, ["diff", "--cached", "--", file]);
    } catch { /* ignore */ }

    if (!diff) {
      try {
        diff = await git(cwd, ["diff", "--", file]);
      } catch { /* ignore */ }
    }

    // 新規ファイル（未追跡）の場合は全内容を「追加」として表示
    if (!diff) {
      try {
        const content = await git(cwd, ["show", `:${file}`]);
        const lines = content.split("\n");
        diff = `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` +
          lines.map((l) => `+${l}`).join("\n");
      } catch {
        // show も失敗した場合、ファイルを直接読む（未追跡ファイル）
        try {
          const { readFile } = await import("fs/promises");
          const fullPath = path.join(cwd, file);
          const content = await readFile(fullPath, "utf-8");
          const lines = content.split("\n");
          diff = `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` +
            lines.map((l) => `+${l}`).join("\n");
        } catch {
          diff = "バイナリファイルです。差分は表示できません。";
        }
      }
    }

    res.json({ diff });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/repos/:repoId/git/stage
router.post("/api/repos/:repoId/git/stage", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    const files: string[] = req.body.files;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: "files が必要です。" });
      return;
    }
    for (const f of files) validateFilePath(f);
    await git(cwd, ["add", "--", ...files]);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/repos/:repoId/git/unstage
router.post("/api/repos/:repoId/git/unstage", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    const files: string[] = req.body.files;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: "files が必要です。" });
      return;
    }
    for (const f of files) validateFilePath(f);
    await git(cwd, ["reset", "HEAD", "--", ...files]);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/repos/:repoId/git/commit
router.post("/api/repos/:repoId/git/commit", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    const message: string = req.body.message;
    if (!message || !message.trim()) {
      res.status(400).json({ success: false, error: "コミットメッセージが必要です。" });
      return;
    }
    await git(cwd, ["commit", "-m", message.trim()]);
    res.json({ success: true, message: "コミットしました。" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/repos/:repoId/git/undo-commit
// 直前のコミットを取り消し、変更をステージに戻す（git reset --soft HEAD~1）
router.post("/api/repos/:repoId/git/undo-commit", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    // 取り消すコミットのメッセージを取得（UIに戻すため）
    const commitMsg = (await git(cwd, ["log", "-1", "--format=%s"])).trim();
    await git(cwd, ["reset", "--soft", "HEAD~1"]);
    res.json({ success: true, message: "コミットを取り消しました。", commitMessage: commitMsg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/repos/:repoId/git/fetch
router.post("/api/repos/:repoId/git/fetch", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    await git(cwd, ["fetch", "origin"], 30000);
    res.json({ success: true, message: "Fetchしました。" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/repos/:repoId/git/pull
// 2段階戦略: ff-only → rebase（コンフリクト時は abort）
router.post("/api/repos/:repoId/git/pull", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);

    // 1. まず ff-only を試行
    try {
      await git(cwd, ["pull", "--ff-only", "origin"], 30000);
      res.json({ success: true, message: "Pullしました。" });
      return;
    } catch {
      // ff-only 失敗 → rebase を試行
    }

    // 2. rebase を試行
    try {
      await git(cwd, ["pull", "--rebase", "origin"], 30000);
      res.json({ success: true, message: "Pullしました（リベース）。" });
      return;
    } catch (rebaseErr: unknown) {
      // rebase 中にコンフリクト → abort で元に戻す
      try {
        await git(cwd, ["rebase", "--abort"], 10000);
      } catch {
        // abort 自体が失敗する場合（rebase 状態でない等）は無視
      }
      const msg = rebaseErr instanceof Error ? rebaseErr.message : "";
      if (msg.includes("overwritten by")) {
        res.status(409).json({
          success: false,
          error: "ローカルの変更がPullにより上書きされるため中止されました。先にコミットするか、ターミナルでstashしてください。",
        });
      } else {
        res.status(409).json({
          success: false,
          error: "コンフリクトが発生する操作のため、Pullを中止しました。リポジトリは元の状態に戻っています。ターミナルで手動解決してください。",
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/repos/:repoId/git/push
router.post("/api/repos/:repoId/git/push", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    await git(cwd, ["push", "origin", branch], 30000);
    res.json({ success: true, message: "Pushしました。" });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "不明なエラー";
    if (errMsg.includes("rejected") || errMsg.includes("fetch first")) {
      res.status(409).json({
        success: false,
        error: "リモートに新しいコミットがあります。先にPullしてください。",
      });
    } else if (errMsg.includes("Authentication") || errMsg.includes("permission") || errMsg.includes("403")) {
      res.status(401).json({
        success: false,
        error: "認証に失敗しました。Git認証設定を確認してください。",
      });
    } else {
      res.status(500).json({ success: false, error: errMsg });
    }
  }
});

// GET /api/repos/:repoId/git/log?page=1&perPage=100
// コミット履歴一覧を取得
router.get("/api/repos/:repoId/git/log", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(req.query.perPage as string, 10) || 100));
    const skip = (page - 1) * perPage;

    // perPage + 1 件取得して hasMore を判定（rev-list --count より軽量）
    const logOutput = await git(cwd, [
      "log",
      `--skip=${skip}`,
      `-n`, `${perPage + 1}`,
      "--format=%H%x00%s%x00%an%x00%aI",
      "HEAD",
    ]);

    const allCommits = logOutput
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [hash, message, author, date] = line.split("\x00");
        return { hash, message, author, date };
      });

    const hasMore = allCommits.length > perPage;
    const commits = hasMore ? allCommits.slice(0, perPage) : allCommits;
    res.json({ commits, hasMore });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/repos/:repoId/git/show?commit=<hash>
// コミットの詳細（メッセージ全文 + 変更ファイル一覧 + diff）を取得
router.get("/api/repos/:repoId/git/show", async (req, res) => {
  try {
    const cwd = resolveRepo(req.params.repoId);
    const commit = req.query.commit as string;
    if (!commit || !/^[a-f0-9]{4,40}$/.test(commit)) {
      res.status(400).json({ success: false, error: "有効な commit ハッシュが必要です。" });
      return;
    }

    // コミット情報を取得
    const info = (await git(cwd, [
      "log", "-1", "--format=%H%x00%B%x00%an%x00%aI", commit,
    ])).trim();
    const [hash, messageBody, author, date] = info.split("\x00");

    // 変更ファイル一覧を取得（--root でルートコミットにも対応）
    const nameStatus = await git(cwd, [
      "-c", "core.quotePath=false",
      "diff-tree", "--root", "--no-commit-id", "-r", "--name-status", commit,
    ]);
    const files = nameStatus
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split("\t");
        const status = parts[0].charAt(0); // R100 → R
        const filePath = parts.length > 2 ? parts[2] : parts[1]; // リネームの場合は新パス
        return { path: filePath, status };
      });

    // diff を取得（--root でルートコミットにも対応）
    const diff = await git(cwd, [
      "-c", "core.quotePath=false",
      "diff-tree", "--root", "-p", "--no-commit-id", commit,
    ], 30000);

    res.json({ hash, message: messageBody.trim(), author, date, files, diff });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
