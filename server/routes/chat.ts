import { Router } from "express";
import { executeChat } from "../claude/executor.js";
import { expandSlashCommand } from "../claude/commandExpander.js";

const router = Router();

// In-memory repo path lookup (populated by repos route)
const BASE_DIR = "$BASE_PROJECT_DIR";

router.post("/api/chat", async (req, res) => {
  const { message, repoId, sessionId, autoEdit } = req.body;

  if (!message || !repoId) {
    res.status(400).json({ error: "message and repoId are required" });
    return;
  }

  const repoPath = `${BASE_DIR}/${repoId}`;

  // スラッシュコマンドを展開
  const { prompt } = await expandSlashCommand(message, repoPath);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 15秒ごとにkeepaliveを送信（SSE接続維持）
  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15_000);

  executeChat(prompt, repoId, repoPath, sessionId ?? null, autoEdit ?? true, {
    onText: (content) => {
      send({ type: "text", content });
    },
    onActivity: (activity) => {
      send({ type: "activity", activity });
    },
    onToolResult: (result) => {
      send({ type: "tool_result", toolName: result.toolName, content: result.content });
    },
    onSessionId: (sessionId) => {
      send({ type: "session_id", sessionId });
    },
    onPermission: (permission) => {
      send({
        type: "permission",
        toolName: permission.toolName,
        toolInput: permission.toolInput,
        requestId: permission.requestId,
      });
    },
    onDone: (sid) => {
      clearInterval(keepalive);
      send({ type: "done", sessionId: sid });
      res.end();
    },
    onError: (error) => {
      clearInterval(keepalive);
      send({ type: "error", error });
      res.end();
    },
  });

  // Handle client disconnect
  req.on("close", () => {
    clearInterval(keepalive);
    // Don't abort — allow session to continue for reconnection
  });
});

export default router;
