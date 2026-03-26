import "./config.js"; // Load .env before anything else
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import reposRouter from "./routes/repos.js";
import statusRouter from "./routes/status.js";
import chatRouter from "./routes/chat.js";
import permissionRouter from "./routes/permission.js";
import reconnectRouter from "./routes/reconnect.js";
import sessionsRouter from "./routes/sessions.js";
import filesRouter from "./routes/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// API routes
app.use(reposRouter);
app.use(statusRouter);
app.use(chatRouter);
app.use(permissionRouter);
app.use(reconnectRouter);
app.use(sessionsRouter);
app.use(filesRouter);

// Serve frontend static files in production
const frontendDist = path.join(__dirname, "../frontend/dist");
// assetsはハッシュ付きなので長期キャッシュOK、HTMLはキャッシュしない
app.use("/assets", express.static(path.join(frontendDist, "assets"), { maxAge: "1y" }));
app.use(express.static(frontendDist, { etag: false, lastModified: false, maxAge: 0 }));
app.get("/{*path}", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(frontendDist, "index.html"));
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`AgentNest server running on http://0.0.0.0:${PORT}`);
  // Electron子プロセスとして起動された場合、親に起動完了を通知
  if (typeof process.send === "function") {
    process.send({ type: "ready", port: PORT });
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`ポート ${PORT} は既に使用されています`);
    if (typeof process.send === "function") {
      process.send({ type: "error", message: `ポート ${PORT} は既に使用されています` });
    }
  } else {
    console.error("サーバーエラー:", err.message);
    if (typeof process.send === "function") {
      process.send({ type: "error", message: err.message });
    }
  }
  process.exit(1);
});
