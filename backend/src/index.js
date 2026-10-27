import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET must be configured");
if (!mongoUri) throw new Error("MONGODB_URI must be configured");

await mongoose.connect(mongoUri);
app.listen(port, () => {
  console.log(`QuizTime API listening on http://localhost:${port}`);
});
