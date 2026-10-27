import { Router } from "express";
import Attempt from "../models/Attempt.js";
import Quiz from "../models/Quiz.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { serializeQuiz } from "../utils/quizDto.js";
import { createQuizSchema, updateQuizSchema, validate, validateObjectId } from "../middleware/validation.js";

const router = Router();
router.use(authenticate);

router.get("/", asyncRoute(async (req, res) => {
  const quizzes = await Quiz.find(req.user.role === "teacher" ? { teacherId: req.user._id } : {}).sort({ startTime: 1 });
  if (req.user.role === "teacher") return res.json(quizzes.map((quiz) => serializeQuiz(quiz, { includeCorrect: true })));

  const attempts = await Attempt.find({ studentId: req.user._id, quizId: { $in: quizzes.map((quiz) => quiz._id) } })
    .select("quizId submittedAt");
  const attemptByQuiz = new Map(attempts.map((attempt) => [String(attempt.quizId), attempt]));
  const now = Date.now();
  return res.json(quizzes.map((quiz) => {
    const attempt = attemptByQuiz.get(String(quiz._id));
    const status = attempt?.submittedAt ? "SUBMITTED"
      : now < quiz.startTime.getTime() ? "UPCOMING"
      : now > quiz.endTime.getTime() ? "CLOSED" : "ACTIVE";
    return {
      ...serializeQuiz(quiz),
      status,
      hasAttempt: Boolean(attempt),
      attemptId: attempt ? String(attempt._id) : undefined,
    };
  }));
}));

router.post("/", requireRole("teacher"), validate(createQuizSchema), asyncRoute(async (req, res) => {
  const quiz = await Quiz.create({ ...req.body, teacherId: req.user._id });
  return res.status(201).json(serializeQuiz(quiz, { includeCorrect: true }));
}));

router.get("/:quizId", validateObjectId("quizId"), asyncRoute(async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  if (req.user.role === "teacher" && !quiz.teacherId.equals(req.user._id)) {
    return res.status(403).json({ error: "You do not own this quiz" });
  }
  return res.json(serializeQuiz(quiz, { includeCorrect: req.user.role === "teacher" }));
}));

router.patch("/:quizId", requireRole("teacher"), validateObjectId("quizId"), validate(updateQuizSchema), asyncRoute(async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  if (!quiz.teacherId.equals(req.user._id)) return res.status(403).json({ error: "You do not own this quiz" });
  const nextStart = req.body.startTime ?? quiz.startTime;
  const nextEnd = req.body.endTime ?? quiz.endTime;
  if (nextEnd <= nextStart) return res.status(422).json({
    error: "Request validation failed",
    fieldErrors: [{ field: "endTime", message: "End time must be after start time" }],
  });
  Object.assign(quiz, req.body);
  await quiz.save();
  return res.json(serializeQuiz(quiz, { includeCorrect: true }));
}));

router.delete("/:quizId", requireRole("teacher"), validateObjectId("quizId"), asyncRoute(async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  if (!quiz.teacherId.equals(req.user._id)) return res.status(403).json({ error: "You do not own this quiz" });
  await Promise.all([quiz.deleteOne(), Attempt.deleteMany({ quizId: quiz._id })]);
  return res.status(204).end();
}));

router.get("/:quizId/analytics", requireRole("teacher"), validateObjectId("quizId"), asyncRoute(async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  if (!quiz.teacherId.equals(req.user._id)) return res.status(403).json({ error: "You do not own this quiz" });
  const attempts = await Attempt.find({ quizId: quiz._id, submittedAt: { $ne: null } }).select("score answers");
  const questions = quiz.questions.map((question) => {
    const correctIds = question.options.filter((option) => option.isCorrect).map((option) => String(option._id)).sort();
    const incorrect = attempts.filter((attempt) => {
      const selected = attempt.answers.find((answer) => answer.questionId.equals(question._id))?.selectedOptionIds.map(String).sort() ?? [];
      return selected.length !== correctIds.length || selected.some((id, index) => id !== correctIds[index]);
    }).length;
    return {
      questionId: String(question._id),
      text: question.text,
      attempts: attempts.length,
      incorrect,
      errorRatePercent: attempts.length ? Math.round((incorrect / attempts.length) * 100) : 0,
    };
  }).sort((a, b) => b.errorRatePercent - a.errorRatePercent || b.incorrect - a.incorrect);
  const scores = attempts.map((attempt) => attempt.score ?? 0);
  return res.json({
    quizTitle: quiz.title,
    totalAttempts: attempts.length,
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 100) / 100 : 0,
    questions,
  });
}));

router.get("/:quizId/leaderboard", validateObjectId("quizId"), asyncRoute(async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId).select("title");
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  const attempts = await Attempt.find({ quizId: quiz._id, submittedAt: { $ne: null } })
    .populate("studentId", "name")
    .select("studentId score startedAt submittedAt");
  const leaderboard = attempts.map((attempt) => ({
    studentName: attempt.studentId?.name ?? "Student",
    score: attempt.score ?? 0,
    timeTakenSeconds: Math.max(0, (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
    submittedAt: attempt.submittedAt,
  })).sort((a, b) => b.score - a.score || a.timeTakenSeconds - b.timeTakenSeconds || a.studentName.localeCompare(b.studentName));
  return res.json({ quizTitle: quiz.title, leaderboard });
}));

export default router;
