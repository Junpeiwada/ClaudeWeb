import { Router } from "express";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const router = Router();

const BASE_DIR = "$BASE_PROJECT_DIR";
const CLAUDE_DIR = join(homedir(), ".claude", "projects");

/** Convert a repo path to the Claude Code session directory name */
function encodeProjectPath(repoPath: string): string {
  // $BASE_PROJECT_DIR/ClaudeWeb → -Users-junpeiwada-Documents-Project-ClaudeWeb
  return repoPath.replace(/\//g, "-");
}

interface SessionInfo {
  sessionId: string;
  title: string;
  firstMessage: string;
  timestamp: string;
}

/** Extract session metadata from a JSONL file (reads only what's needed) */
async function parseSessionMeta(filePath: string): Promise<{
  title: string;
  firstMessage: string;
  timestamp: string;
} | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    let title = "";
    let firstMessage = "";
    let timestamp = "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);

        if (obj.type === "ai-title" && obj.aiTitle) {
          title = obj.aiTitle;
        }

        if (obj.type === "user" && !firstMessage) {
          timestamp = obj.timestamp ?? "";
          const content = obj.message?.content;
          if (Array.isArray(content)) {
            // Extract last text block (skip IDE context tags)
            const texts = content
              .filter((b: any) => b.type === "text" && typeof b.text === "string")
              .map((b: any) => b.text as string)
              .filter((t: string) => !t.startsWith("<ide_"));
            firstMessage = (texts[texts.length - 1] ?? texts[0] ?? "").slice(0, 120);
          }
        }

        // Once we have both, stop early
        if (title && firstMessage) break;
      } catch {}
    }

    if (!firstMessage && !title) return null;
    return { title, firstMessage, timestamp };
  } catch {
    return null;
  }
}

/** GET /api/sessions/:repoId — list sessions for a repo */
router.get("/api/sessions/:repoId", async (req, res) => {
  const { repoId } = req.params;
  const repoPath = `${BASE_DIR}/${repoId}`;
  const projectDir = join(CLAUDE_DIR, encodeProjectPath(repoPath));

  try {
    const files = await readdir(projectDir).catch(() => [] as string[]);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    const sessions: SessionInfo[] = [];

    await Promise.all(
      jsonlFiles.map(async (file) => {
        const sessionId = file.replace(".jsonl", "");
        const filePath = join(projectDir, file);
        const meta = await parseSessionMeta(filePath);
        if (meta) {
          sessions.push({
            sessionId,
            title: meta.title,
            firstMessage: meta.firstMessage,
            timestamp: meta.timestamp,
          });
        }
      })
    );

    // Sort by timestamp descending (most recent first)
    sessions.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return b.timestamp.localeCompare(a.timestamp);
    });

    res.json(sessions);
  } catch {
    res.json([]);
  }
});

/** GET /api/sessions/:repoId/:sessionId/messages — load conversation history */
router.get("/api/sessions/:repoId/:sessionId/messages", async (req, res) => {
  const { repoId, sessionId } = req.params;
  const repoPath = `${BASE_DIR}/${repoId}`;
  const projectDir = join(CLAUDE_DIR, encodeProjectPath(repoPath));
  const filePath = join(projectDir, `${sessionId}.jsonl`);

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);

        if (obj.type === "user") {
          const blocks = obj.message?.content;
          if (Array.isArray(blocks)) {
            const texts = blocks
              .filter((b: any) => b.type === "text" && typeof b.text === "string")
              .map((b: any) => b.text as string)
              .filter((t: string) => !t.startsWith("<ide_") && !t.startsWith("<system-reminder>"));
            const text = texts.join("\n").trim();
            if (text) {
              messages.push({ role: "user", content: text });
            }
          }
        }

        if (obj.type === "assistant") {
          const blocks = obj.message?.content;
          if (Array.isArray(blocks)) {
            const parts: string[] = [];
            for (const block of blocks) {
              if (block.type === "text" && typeof block.text === "string") {
                parts.push(block.text);
              } else if (block.type === "tool_use") {
                const name = block.name ?? "Tool";
                parts.push(`[${name}]`);
              }
            }
            const text = parts.join("\n").trim();
            if (text) {
              // Merge consecutive assistant messages
              const last = messages[messages.length - 1];
              if (last?.role === "assistant") {
                last.content += "\n\n" + text;
              } else {
                messages.push({ role: "assistant", content: text });
              }
            }
          }
        }
      } catch {}
    }

    res.json(messages);
  } catch {
    res.status(404).json({ error: "Session not found" });
  }
});

export default router;
