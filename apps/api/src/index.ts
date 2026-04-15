import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDatabase } from "./services/cosmos";
import sessionRoutes from "./routes/sessions";
import sipRoutes from "./routes/sips";

dotenv.config({ path: "../../.env" });

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "learntok-api" });
});

// Route handlers
app.use("/api/sessions", sessionRoutes);
app.use("/api/sips", sipRoutes);

async function start() {
  try {
    await initDatabase();
    console.log("Database initialised successfully");
  } catch (err) {
    console.warn("Database init failed (will retry on first request):", err);
  }

  app.listen(PORT, () => {
    console.log(`LearnTok API running on http://localhost:${PORT}`);
  });
}

start();
