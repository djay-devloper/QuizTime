import mongoose from "mongoose";
import { z } from "zod";

const optionSchema = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  type: z.enum(["single", "multiple"]),
  points: z.number().int().min(1).max(1000),
  options: z.array(optionSchema).min(2).max(10),
}).superRefine((question, ctx) => {
  const correctCount = question.options.filter((option) => option.isCorrect).length;
  if (correctCount === 0) ctx.addIssue({ code: "custom", message: "Choose at least one correct option", path: ["options"] });
  if (question.type === "single" && correctCount !== 1) {
    ctx.addIssue({ code: "custom", message: "Single-choice questions need exactly one correct option", path: ["options"] });
  }
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export const createQuizSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  timeLimitSeconds: z.number().int().min(10).max(86400),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  questions: z.array(questionSchema).min(1).max(100),
}).superRefine((quiz, ctx) => {
  if (quiz.endTime <= quiz.startTime) {
    ctx.addIssue({ code: "custom", message: "End time must be after start time", path: ["endTime"] });
  }
});

export const updateQuizSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  timeLimitSeconds: z.number().int().min(10).max(86400).optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field");

export const answerSchema = z.object({
  questionId: z.string().regex(/^[\da-f]{24}$/i, "Invalid question ID"),
  optionIds: z.array(z.string().regex(/^[\da-f]{24}$/i, "Invalid option ID")).max(10),
});

export const objectIdParams = z.object({
  quizId: z.string().regex(/^[\da-f]{24}$/i, "Invalid quiz ID").optional(),
  attemptId: z.string().regex(/^[\da-f]{24}$/i, "Invalid attempt ID").optional(),
  id: z.string().regex(/^[\da-f]{24}$/i, "Invalid ID").optional(),
});

export function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(422).json({
        error: "Request validation failed",
        fieldErrors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    req[source] = result.data;
    return next();
  };
}

export function validateObjectId(paramName) {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[paramName])) {
      return res.status(400).json({ error: `Invalid ${paramName} format` });
    }
    return next();
  };
}
