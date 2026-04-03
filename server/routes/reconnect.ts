import { Router } from "express";
import { subscribeToSession, getSession, log as serverLog } from "../claude/executor.js";

const router = Router();

router.get("/api/reconnect", (req, res) => {
  const currentSessionExists = !!getSession();
  serverLog("RECONNECT_ATTEMPT", { timestamp: new Date().toISOString(), currentSessionExists });

  const sub = subscribeToSession();
  if (!sub) {
    serverLog("RECONNECT_NO_SESSION", { currentSessionExists, message: "No active session found" });
    res.status(404).json({ error: "No active session" });
    return;
  }

  const { session, addListener, unsubscribe } = sub;

  serverLog("RECONNECT_OK", {
    sessionId: session.sessionId,
    completed: session.completed,
    partsCount: session.assistantMessage.parts.length,
  });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setTimeout(0); // SSE接続のタイムアウトを無効化
  res.flushHeaders();

  let connectionOpen = true;

  const send = (data: object) => {
    if (!connectionOpen) return;
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      serverLog("RECONNECT_WRITE_ERROR", { type: (data as any).type, error: String(err) });
      connectionOpen = false;
    }
  };

  // Send current state snapshot so the client can restore its UI
  send({
    type: "reconnect_state",
    sessionId: session.sessionId,
    assistantMessage: session.assistantMessage,
    pendingPermission: session.pendingPermission,
    pendingQuestion: session.pendingQuestion,
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
    try {
      res.write(": keepalive\n\n");
    } catch (err) {
      serverLog("RECONNECT_KEEPALIVE_ERROR", { error: String(err) });
      connectionOpen = false;
    }
  }, 15_000);

  req.on("close", () => {
    serverLog("RECONNECT_CLIENT_DISCONNECT", { sessionId: session.sessionId });
    connectionOpen = false;
    clearInterval(keepalive);
    unsubscribe();
  });
});

export default router;
