import { Router } from "express";
import { executeChat } from "../claude/executor.js";

const router = Router();

// In-memory repo path lookup (populated by repos route)
const BASE_DIR = "$BASE_PROJECT_DIR";

router.post("/api/chat", (req, res) => {
  const { message, repoId, sessionId } = req.body;

  if (!message || !repoId) {
    res.status(400).json({ error: "message and repoId are required" });
    return;
  }

  const repoPath = `${BASE_DIR}/${repoId}`;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  executeChat(message, repoId, repoPath, sessionId ?? null, {
    onText: (content) => {
      send({ type: "text", content });
    },
    onActivity: (activity) => {
      send({ type: "activity", activity });
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
      send({ type: "done", sessionId: sid });
      res.end();
    },
    onError: (error) => {
      send({ type: "error", error });
      res.end();
    },
  });

  // Handle client disconnect
  req.on("close", () => {
    // Don't abort — allow session to continue for reconnection
  });
});

export default router;
