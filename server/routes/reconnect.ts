import { Router } from "express";
import { subscribeToSession } from "../claude/executor.js";

const router = Router();

router.get("/api/reconnect", (req, res) => {
  const sub = subscribeToSession();
  if (!sub) {
    res.status(404).json({ error: "No active session" });
    return;
  }

  const { session, addListener, unsubscribe } = sub;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let connectionOpen = true;

  const send = (data: object) => {
    if (!connectionOpen) return;
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  // Send current state snapshot so the client can restore its UI
  send({
    type: "reconnect_state",
    sessionId: session.sessionId,
    assistantMessage: session.assistantMessage,
    pendingPermission: session.pendingPermission,
    completed: session.completed,
  });

  // If session already completed, close immediately
  if (session.completed) {
    send({ type: "done", sessionId: session.sessionId });
    res.end();
    return;
  }

  // Subscribe to future events
  addListener((data) => send(data));

  const keepalive = setInterval(() => {
    if (!connectionOpen) return;
    try { res.write(": keepalive\n\n"); } catch {}
  }, 15_000);

  req.on("close", () => {
    connectionOpen = false;
    clearInterval(keepalive);
    unsubscribe();
  });
});

export default router;
