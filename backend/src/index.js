import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import app from "./app.js";

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(backendDirectory, ".env") });

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Copy backend/.env.example to backend/.env and set a long random secret.");
  process.exit(1);
}
if (!mongoUri) {
  console.error("MONGODB_URI is missing. Copy backend/.env.example to backend/.env and set your MongoDB connection string.");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a valid TCP port between 1 and 65535.");
  process.exit(1);
}

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  app.listen(port, () => {
    console.log(`QuizTime API listening on http://localhost:${port}`);
  });
} catch {
  console.error("MongoDB connection failed. Start MongoDB locally or check MONGODB_URI and network access.");
  process.exit(1);
}
