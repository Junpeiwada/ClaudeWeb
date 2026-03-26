import { Router } from "express";
import { executeChat } from "../claude/executor.js";
import { expandSlashCommand } from "../claude/commandExpander.js";
import { BASE_DIR } from "../config.js";

const router = Router();

router.post("/api/chat", async (req, res) => {
  const { message, repoId, sessionId, autoEdit, images } = req.body;

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
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let connectionOpen = true;

  const send = (data: object, flush = false) => {
    if (!connectionOpen) return;
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (flush && typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    } catch {}
  };

  // 15秒ごとにkeepaliveを送信（SSE接続維持）
  const keepalive = setInterval(() => {
    if (!connectionOpen) return;
    try { res.write(": keepalive\n\n"); } catch {}
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
    onLimitError: (error) => {
      send({ type: "limit_error", error });
    },
    onSessionId: (sessionId) => {
      send({ type: "session_id", sessionId });
    },
    onPermission: (permission) => {
      console.log("[PERMISSION]", permission.toolName, "requestId:", permission.requestId, "connectionOpen:", connectionOpen);
      send({
        type: "permission",
        toolName: permission.toolName,
        toolInput: permission.toolInput,
        requestId: permission.requestId,
      }, true);
    },
    onDone: (sid) => {
      clearInterval(keepalive);
      send({ type: "done", sessionId: sid });
      if (connectionOpen) {
        try { res.end(); } catch {}
      }
    },
    onError: (error) => {
      clearInterval(keepalive);
      send({ type: "error", error });
      if (connectionOpen) {
        try { res.end(); } catch {}
      }
    },
  }, images);

  // Handle client disconnect — session continues for reconnection
  req.on("close", () => {
    connectionOpen = false;
    clearInterval(keepalive);
  });
});

export default router;
