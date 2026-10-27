import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import quizRoutes from "./routes/quizzes.js";
import attemptRoutes from "./routes/attempts.js";
import { errorHandler, notFound } from "./middleware/errors.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api", attemptRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
