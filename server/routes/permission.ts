import { Router } from "express";
import { resolvePermission } from "../claude/executor.js";

const router = Router();

router.post("/api/permission", (req, res) => {
  const { requestId, approved } = req.body;

  if (!requestId || typeof approved !== "boolean") {
    res.status(400).json({ error: "requestId and approved are required" });
    return;
  }

  const resolved = resolvePermission(requestId, approved);
  if (!resolved) {
    res.status(404).json({ error: "No pending permission with this requestId" });
    return;
  }

  res.json({ ok: true });
});

export default router;
