import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import gymRouter from "./routes/gym.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.use("/api", gymRouter);

// Serve built frontend
app.use(express.static(path.join(__dirname, "../../client/dist")));

// SPA fallback — all non-API routes serve index.html
app.get("/{*splat}", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

app.listen(PORT, () => {
  console.log(`🏋️  AI Gym Tracker server running on http://localhost:${PORT}`);
});

export default app;
