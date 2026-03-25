import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import reposRouter from "./routes/repos.js";
import statusRouter from "./routes/status.js";
import chatRouter from "./routes/chat.js";
import permissionRouter from "./routes/permission.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use(reposRouter);
app.use(statusRouter);
app.use(chatRouter);
app.use(permissionRouter);

// Serve frontend static files in production
const frontendDist = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ClaudeWeb server running on http://0.0.0.0:${PORT}`);
});
