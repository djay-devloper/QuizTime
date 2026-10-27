import { Router } from "express";
import Attempt from "../models/Attempt.js";
import Quiz from "../models/Quiz.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { answerSchema, validate, validateObjectId } from "../middleware/validation.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { shuffle } from "../utils/quizDto.js";

const router = Router();
router.use(authenticate, requireRole("student"));

function assertOwner(attempt, userId) {
  return String(attempt.studentId) === String(userId);
}

function compareOptionSets(left, right) {
  const sortedLeft = [...left].map(String).sort();
  const sortedRight = [...right].map(String).sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((id, index) => id === sortedRight[index]);
}

function gradeAttempt(attempt, quiz) {
  const answers = new Map(attempt.answers.map((answer) => [String(answer.questionId), answer]));
  return quiz.questions.reduce((score, question) => {
    const savedAnswer = answers.get(String(question._id));
    if (!savedAnswer || savedAnswer.savedAt.getTime() > attempt.expiresAt.getTime()) return score;
    const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => String(option._id));
    return score + (compareOptionSets(savedAnswer.selectedOptionIds, correctOptionIds) ? question.points : 0);
  }, 0);
}

function publicQuestions(quiz, attempt) {
  const orderedQuestions = attempt.questionOrder.map((questionId) => quiz.questions.id(questionId)).filter(Boolean);
  return orderedQuestions.map((question) => {
    const order = attempt.optionOrder.find((item) => item.questionId.equals(question._id));
    const optionIds = order?.optionIds ?? question.options.map((option) => option._id);
    return {
      id: String(question._id),
      text: question.text,
      type: question.type,
      points: question.points,
      options: optionIds.map((id) => question.options.id(id)).filter(Boolean).map((option) => ({
        id: String(option._id),
        text: option.text,
      })),
      selectedOptionIds: attempt.answers.find((answer) => answer.questionId.equals(question._id))?.selectedOptionIds.map(String) ?? [],
    };
  });
}

router.post("/quizzes/:quizId/attempts", validateObjectId("quizId"), asyncRoute(async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  const startedAt = new Date();
  if (startedAt.getTime() < quiz.startTime.getTime()) return res.status(403).json({ error: "This quiz has not opened yet" });
  if (startedAt.getTime() > quiz.endTime.getTime()) return res.status(403).json({ error: "This quiz is closed" });
  const existing = await Attempt.findOne({ quizId: quiz._id, studentId: req.user._id });
  if (existing) return res.status(409).json({
    error: existing.submittedAt ? "You have already submitted this quiz" : "You already have an attempt in progress",
    attemptId: String(existing._id),
  });
  const questionOrder = shuffle(quiz.questions.map((question) => question._id));
  const optionOrder = quiz.questions.map((question) => ({
    questionId: question._id,
    optionIds: shuffle(question.options.map((option) => option._id)),
  }));
  const expiresAt = new Date(Math.min(
    startedAt.getTime() + quiz.timeLimitSeconds * 1000,
    quiz.endTime.getTime(),
  ));
  try {
    const attempt = await Attempt.create({
      quizId: quiz._id,
      studentId: req.user._id,
      startedAt,
      expiresAt,
      questionOrder,
      optionOrder,
    });
    return res.status(201).json({
      id: String(attempt._id),
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      serverNow: new Date(),
      quiz: { id: String(quiz._id), title: quiz.title, endTime: quiz.endTime },
      questions: publicQuestions(quiz, attempt),
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "You already have an attempt for this quiz" });
    throw error;
  }
}));

router.get("/attempts/:attemptId", validateObjectId("attemptId"), asyncRoute(async (req, res) => {
  const attempt = await Attempt.findById(req.params.attemptId);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  if (!assertOwner(attempt, req.user._id)) return res.status(403).json({ error: "This attempt belongs to another student" });
  const quiz = await Quiz.findById(attempt.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  return res.json({
    id: String(attempt._id),
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    serverNow: new Date(),
    quiz: { id: String(quiz._id), title: quiz.title, endTime: quiz.endTime },
    questions: publicQuestions(quiz, attempt),
  });
}));

router.patch("/attempts/:attemptId/answer", validateObjectId("attemptId"), validate(answerSchema), asyncRoute(async (req, res) => {
  const attempt = await Attempt.findById(req.params.attemptId);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  if (!assertOwner(attempt, req.user._id)) return res.status(403).json({ error: "This attempt belongs to another student" });
  if (attempt.submittedAt) return res.status(409).json({ error: "This attempt has already been submitted" });
  if (Date.now() > attempt.expiresAt.getTime()) {
    return res.status(403).json({ error: "Time limit exceeded for this attempt" });
  }
  const quiz = await Quiz.findById(attempt.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  const question = quiz.questions.id(req.body.questionId);
  if (!question || !attempt.questionOrder.some((id) => id.equals(question._id))) {
    return res.status(422).json({ error: "Question is not part of this attempt" });
  }
  const optionIds = req.body.optionIds;
  const validIds = new Set(question.options.map((option) => String(option._id)));
  if (new Set(optionIds).size !== optionIds.length || optionIds.some((id) => !validIds.has(id))) {
    return res.status(422).json({ error: "Select only valid options for this question" });
  }
  if (question.type === "single" && optionIds.length > 1) {
    return res.status(422).json({ error: "Select only one option for this question" });
  }
  const receivedAt = new Date();
  const answer = attempt.answers.find((item) => item.questionId.equals(question._id));
  if (answer) {
    answer.selectedOptionIds = optionIds;
    answer.savedAt = receivedAt;
  } else {
    attempt.answers.push({ questionId: question._id, selectedOptionIds: optionIds, savedAt: receivedAt });
  }
  await attempt.save();
  return res.json({ saved: true, savedAt: receivedAt });
}));

router.post("/attempts/:attemptId/submit", validateObjectId("attemptId"), asyncRoute(async (req, res) => {
  const attempt = await Attempt.findById(req.params.attemptId);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  if (!assertOwner(attempt, req.user._id)) return res.status(403).json({ error: "This attempt belongs to another student" });
  if (!attempt.submittedAt) {
    const quiz = await Quiz.findById(attempt.quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    attempt.score = gradeAttempt(attempt, quiz);
    attempt.submittedAt = new Date();
    await attempt.save();
  }
  return res.json({
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    timeTakenSeconds: Math.max(0, (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
  });
}));

router.get("/attempts/:attemptId/results", validateObjectId("attemptId"), asyncRoute(async (req, res) => {
  const attempt = await Attempt.findById(req.params.attemptId);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  if (!assertOwner(attempt, req.user._id)) return res.status(403).json({ error: "This attempt belongs to another student" });
  if (!attempt.submittedAt) return res.status(409).json({ error: "Submit the attempt before viewing results" });
  const quiz = await Quiz.findById(attempt.quizId);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  const revealAnswers = Date.now() > quiz.endTime.getTime();
  const response = {
    attemptId: String(attempt._id),
    quizTitle: quiz.title,
    score: attempt.score,
    submittedAt: attempt.submittedAt,
    timeTakenSeconds: Math.max(0, (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
    revealAnswers,
  };
  if (revealAnswers) {
    response.questions = attempt.questionOrder.map((questionId) => {
      const question = quiz.questions.id(questionId);
      if (!question) return null;
      const answer = attempt.answers.find((entry) => entry.questionId.equals(question._id));
      const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => String(option._id));
      const selectedOptionIds = answer?.selectedOptionIds.map(String) ?? [];
      return {
        questionId: String(question._id),
        text: question.text,
        points: question.points,
        selectedOptionIds,
        correctOptionIds,
        correct: compareOptionSets(selectedOptionIds, correctOptionIds),
        options: question.options.map((option) => ({ id: String(option._id), text: option.text })),
      };
    }).filter(Boolean);
  }
  return res.json(response);
}));

export default router;
