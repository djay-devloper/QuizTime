import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import User from "./models/User.js";
import Quiz from "./models/Quiz.js";
import Attempt from "./models/Attempt.js";

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(backendDirectory, ".env") });

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is missing. Copy backend/.env.example to backend/.env and set your MongoDB connection string.");
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI);

try {
  const passwordHash = await bcrypt.hash("password123", 12);
  const accounts = [
    { name: "Demo Teacher", email: "teacher@demo.com", role: "teacher" },
    { name: "Alex Morgan", email: "student1@demo.com", role: "student" },
    { name: "Jordan Lee", email: "student2@demo.com", role: "student" },
    { name: "Taylor Kim", email: "student3@demo.com", role: "student" },
  ];
  const users = await Promise.all(accounts.map(({ name, email, role }) =>
    User.findOneAndUpdate({ email }, { $set: { name, email, role, passwordHash } }, { upsert: true, new: true, runValidators: true }),
  ));
  const [teacher, ...students] = users;
  const priorQuizzes = await Quiz.find({ teacherId: teacher._id }).select("_id");
  await Promise.all([
    Attempt.deleteMany({ quizId: { $in: priorQuizzes.map((quiz) => quiz._id) } }),
    Quiz.deleteMany({ teacherId: teacher._id }),
  ]);

  const questionSet = [
    { text: "Which planet is known as the Red Planet?", type: "single", points: 2, options: [{ text: "Mars", isCorrect: true }, { text: "Venus", isCorrect: false }, { text: "Jupiter", isCorrect: false }] },
    { text: "Which of these are JavaScript primitive types?", type: "multiple", points: 3, options: [{ text: "string", isCorrect: true }, { text: "boolean", isCorrect: true }, { text: "array", isCorrect: false }, { text: "function", isCorrect: false }] },
    { text: "What is 6 × 7?", type: "single", points: 1, options: [{ text: "42", isCorrect: true }, { text: "36", isCorrect: false }, { text: "48", isCorrect: false }] },
    { text: "Which are mammals?", type: "multiple", points: 2, options: [{ text: "Dolphin", isCorrect: true }, { text: "Bat", isCorrect: true }, { text: "Penguin", isCorrect: false }] },
    { text: "How many sides does a hexagon have?", type: "single", points: 1, options: [{ text: "Six", isCorrect: true }, { text: "Five", isCorrect: false }, { text: "Eight", isCorrect: false }] },
  ];
  const now = new Date();
  const activeQuiz = await Quiz.create({
    teacherId: teacher._id,
    title: "Quick Knowledge Check",
    description: "A demo on science, JavaScript, and arithmetic.",
    timeLimitSeconds: 300,
    startTime: new Date(now.getTime() - 3600000),
    endTime: new Date(now.getTime() + 14 * 86400000),
    questions: questionSet,
  });
  const closedQuiz = await Quiz.create({
    teacherId: teacher._id,
    title: "Foundations Challenge",
    description: "Completed demo attempts for results, leaderboard, and analytics.",
    timeLimitSeconds: 600,
    startTime: new Date(now.getTime() - 5 * 86400000),
    endTime: new Date(now.getTime() - 86400000),
    questions: questionSet,
  });

  const answerScores = [[2, 3, 1, 2, 1], [2, 0, 1, 0, 1], [0, 3, 0, 2, 0]];
  const elapsedSeconds = [240, 320, 410];
  for (let studentIndex = 0; studentIndex < students.length; studentIndex++) {
    const startedAt = new Date(now.getTime() - 3 * 86400000 + studentIndex * 60000);
    const submittedAt = new Date(startedAt.getTime() + elapsedSeconds[studentIndex] * 1000);
    const orderedQuestions = studentIndex % 2 === 0 ? [...closedQuiz.questions] : [...closedQuiz.questions].reverse();
    const questionOrder = orderedQuestions.map((question) => question._id);
    const attempt = await Attempt.create({
      quizId: closedQuiz._id,
      studentId: students[studentIndex]._id,
      startedAt,
      expiresAt: new Date(startedAt.getTime() + closedQuiz.timeLimitSeconds * 1000),
      submittedAt,
      score: answerScores[studentIndex].reduce((sum, score) => sum + score, 0),
      questionOrder,
      optionOrder: closedQuiz.questions.map((question) => ({ questionId: question._id, optionIds: question.options.map((option) => option._id) })),
      answers: closedQuiz.questions.map((question, questionIndex) => {
        const score = answerScores[studentIndex][questionIndex];
        const correct = question.options.filter((option) => option.isCorrect).map((option) => option._id);
        const selected = score === question.points ? correct : score > 0 ? correct.slice(0, 1) : [];
        return { questionId: question._id, selectedOptionIds: selected, savedAt: new Date(startedAt.getTime() + 120000) };
      }),
    });
    if (!attempt) throw new Error(`Failed to seed attempt for ${students[studentIndex].email}`);
  }
  console.log(`Seeded demo accounts, active quiz ${activeQuiz._id}, and closed quiz ${closedQuiz._id}.`);
} finally {
  await mongoose.disconnect();
}
