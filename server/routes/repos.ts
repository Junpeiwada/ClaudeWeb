import { Router } from "express";
import { readdir, stat } from "fs/promises";
import path from "path";

const router = Router();

const BASE_DIR = "$BASE_PROJECT_DIR";

router.get("/api/repos", async (_req, res) => {
  try {
    const entries = await readdir(BASE_DIR);
    const repos = [];

    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const fullPath = path.join(BASE_DIR, name);
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        repos.push({ id: name, name, path: fullPath });
      }
    }

    repos.sort((a, b) => a.name.localeCompare(b.name));
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: "Failed to scan directories" });
  }
});

export default router;
