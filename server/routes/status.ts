import { Router } from "express";
import { getSession, interruptSession } from "../claude/executor.js";

const router = Router();

router.get("/api/status", (_req, res) => {
  const session = getSession();
  if (!session) {
    res.json({ active: false });
    return;
  }
  res.json({
    active: true,
    repoId: session.repoId,
    sessionId: session.sessionId,
    pendingPermission: session.pendingPermission,
  });
});

router.post("/api/interrupt", async (_req, res) => {
  const interrupted = await interruptSession();
  res.json({ interrupted });
});

export default router;
