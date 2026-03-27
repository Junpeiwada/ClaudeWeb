import { Router } from "express";
import { readdir, stat, readFile } from "fs/promises";
import path from "path";
import { BASE_DIR } from "../config.js";

const router = Router();

const IGNORED = new Set([
  ".git", "node_modules", ".next", "dist", "build", ".cache",
  ".vscode", ".idea", "__pycache__", ".DS_Store", "venv",
]);

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);

function getLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
    ".py": "python", ".java": "java", ".cpp": "cpp", ".c": "c",
    ".rs": "rust", ".go": "go", ".rb": "ruby", ".swift": "swift",
    ".html": "html", ".css": "css", ".scss": "scss",
    ".json": "json", ".xml": "xml", ".yaml": "yaml", ".yml": "yaml",
    ".md": "markdown", ".sh": "bash", ".toml": "toml",
  };
  return map[ext] || "text";
}

// ディレクトリ内のファイル一覧（1階層のみ、遅延読み込み用）
router.get("/api/repos/:repoId/files", async (req, res) => {
  const dirParam = (req.query.dir as string) || "";
  const repoPath = path.join(BASE_DIR, req.params.repoId);

  const targetDir = path.join(repoPath, dirParam);
  // セキュリティ: リポジトリ外アクセス防止
  if (!targetDir.startsWith(repoPath)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const targetStat = await stat(targetDir).catch(() => null);
    if (!targetStat) {
      return res.status(404).json({ error: "Directory not found" });
    }
    if (!targetStat.isDirectory()) {
      return res.status(400).json({ error: "Not a directory" });
    }

    const entries = await readdir(targetDir);
    const items = [];

    for (const name of entries) {
      if (IGNORED.has(name) || (name.startsWith(".") && name !== ".env.example")) continue;

      const fullPath = path.join(targetDir, name);
      const s = await stat(fullPath);
      const relativePath = path.relative(repoPath, fullPath);

      if (s.isDirectory()) {
        items.push({ name, path: relativePath, type: "directory" as const });
      } else {
        const ext = path.extname(name).toLowerCase();
        items.push({ name, path: relativePath, type: "file" as const, size: s.size, extension: ext });
      }
    }

    // ディレクトリ優先、名前順
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json(items);
  } catch {
    res.status(500).json({ error: "Failed to read directory" });
  }
});

// ファイル内容取得
router.get("/api/repos/:repoId/file/{*filePath}", async (req, res) => {
  const rawFilePath = req.params.filePath;
  // Express 5 の {*param} は配列で返る
  const filePath = Array.isArray(rawFilePath) ? rawFilePath.join("/") : rawFilePath;
  if (!filePath) return res.status(400).json({ error: "File path required" });

  const repoPath = path.join(BASE_DIR, req.params.repoId);
  const fullPath = path.join(repoPath, filePath);

  if (!fullPath.startsWith(repoPath)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const s = await stat(fullPath);
    if (!s.isFile()) return res.status(400).json({ error: "Not a file" });

    const ext = path.extname(filePath).toLowerCase();

    // 画像
    if (IMAGE_EXT.has(ext)) {
      const buffer = await readFile(fullPath);
      const mime = ext === ".svg" ? "image/svg+xml" : `image/${ext.slice(1)}`;
      return res.json({
        type: "image",
        content: `data:${mime};base64,${buffer.toString("base64")}`,
      });
    }

    // バイナリっぽいファイルはスキップ
    if (s.size > 2_000_000) {
      return res.json({ type: "binary", content: null, message: "ファイルが大きすぎます" });
    }

    const content = await readFile(fullPath, "utf-8");
    const language = getLanguage(ext);

    res.json({
      type: ext === ".md" ? "markdown" : "code",
      content,
      language,
    });
  } catch {
    res.status(500).json({ error: "Failed to read file" });
  }
});

// 生ファイル配信（画像など、ブラウザから直接読み込む用）
router.get("/api/repos/:repoId/raw/{*filePath}", async (req, res) => {
  const rawFilePath = req.params.filePath;
  const filePath = Array.isArray(rawFilePath) ? rawFilePath.join("/") : rawFilePath;
  if (!filePath) return res.status(400).end();

  const repoPath = path.join(BASE_DIR, req.params.repoId);
  const fullPath = path.join(repoPath, filePath);

  if (!fullPath.startsWith(repoPath)) {
    return res.status(403).end();
  }

  try {
    const s = await stat(fullPath);
    if (!s.isFile()) return res.status(404).end();

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
      ".ico": "image/x-icon", ".bmp": "image/bmp",
      ".pdf": "application/pdf",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    const buffer = await readFile(fullPath);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch {
    res.status(404).end();
  }
});

export default router;
