import mongoose from "mongoose";

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error, _req, res, _next) {
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON request body" });
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const fieldErrors = Object.values(error.errors).map((entry) => ({
      field: entry.path,
      message: entry.message,
    }));
    return res.status(422).json({ error: "Request validation failed", fieldErrors });
  }
  if (error?.code === 11000) return res.status(409).json({ error: "This account or resource already exists" });
  if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: "Invalid resource identifier" });
  console.error(error);
  return res.status(500).json({ error: "An unexpected server error occurred" });
}
