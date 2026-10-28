import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

process.env.JWT_SECRET = "jest-only-secret-key-that-is-at-least-32-characters";

let mongo;
let app;
let User;
let Quiz;
let Attempt;
let teacher;
let students;
let teacherToken;
let studentTokens;
let quizId;

const quizPayload = (startTime = new Date(Date.now() - 60000), endTime = new Date(Date.now() + 3600000)) => ({
  title: "Integration Quiz",
  description: "Testing server-enforced quiz behavior",
  timeLimitSeconds: 600,
  startTime: startTime.toISOString(),
  endTime: endTime.toISOString(),
  questions: [
    { text: "Single question", type: "single", points: 2, options: [{ text: "Correct", isCorrect: true }, { text: "Wrong", isCorrect: false }] },
    { text: "Select two", type: "multiple", points: 3, options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }, { text: "C", isCorrect: false }] },
  ],
});

async function login(email) {
  const { body, status } = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  expect(status).toBe(200);
  return body.token;
}

async function createAttempt(token = studentTokens[0], id = quizId) {
  return request(app).post(`/api/quizzes/${id}/attempts`).set("Authorization", `Bearer ${token}`);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ default: User } = await import("../src/models/User.js"));
  ({ default: Quiz } = await import("../src/models/Quiz.js"));
  ({ default: Attempt } = await import("../src/models/Attempt.js"));
  ({ default: app } = await import("../src/app.js"));
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Quiz.deleteMany({}), Attempt.deleteMany({})]);
  const passwordHash = await bcrypt.hash("password123", 4);
  teacher = await User.create({ name: "Demo Teacher", email: "teacher@test.com", passwordHash, role: "teacher" });
  students = await Promise.all(["Student One", "Student Two", "Student Three"].map((name, index) =>
    User.create({ name, email: `student${index + 1}@test.com`, passwordHash, role: "student" }),
  ));
  teacherToken = await login("teacher@test.com");
  studentTokens = await Promise.all(students.map((_, index) => login(`student${index + 1}@test.com`)));
  const created = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${teacherToken}`).send(quizPayload());
  expect(created.status).toBe(201);
  quizId = created.body.id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("Timed Quiz API (MongoDB Memory Server)", () => {
  test("rejects answer updates after the server-side expiry regardless of client timestamps", async () => {
    const started = await createAttempt();
    expect(started.status).toBe(201);
    await Attempt.findByIdAndUpdate(started.body.id, { expiresAt: new Date(Date.now() - 5000) });
    const question = started.body.questions[0];
    const response = await request(app)
      .patch(`/api/attempts/${started.body.id}/answer`)
      .set("Authorization", `Bearer ${studentTokens[0]}`)
      .send({ questionId: question.id, optionIds: [question.options[0].id], clientTime: new Date(Date.now() - 60000).toISOString() });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Time limit exceeded for this attempt");
  });

  test("finalizes an expired attempt using only answers saved before expiry", async () => {
    const started = await createAttempt();
    const question = started.body.questions.find((item) => item.type === "single");
    const quiz = await Quiz.findById(quizId);
    const correct = quiz.questions.id(question.id).options.find((option) => option.isCorrect);
    const saved = await request(app)
      .patch(`/api/attempts/${started.body.id}/answer`)
      .set("Authorization", `Bearer ${studentTokens[0]}`)
      .send({ questionId: question.id, optionIds: [String(correct._id)] });
    expect(saved.status).toBe(200);
    const expiredAt = new Date(Date.now() - 5000);
    await Attempt.findByIdAndUpdate(started.body.id, {
      $set: {
        expiresAt: expiredAt,
        "answers.0.savedAt": new Date(expiredAt.getTime() - 1000),
      },
    });
    const persisted = await Attempt.findById(started.body.id);
    expect(persisted.answers[0].savedAt.getTime()).toBeLessThanOrEqual(persisted.expiresAt.getTime());
    const submitted = await request(app)
      .post(`/api/attempts/${started.body.id}/submit`)
      .set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(submitted.status).toBe(200);
    expect(submitted.body.expired).toBe(true);
    expect(submitted.body.score).toBe(2);
  });

  test("does not leak answer keys through quiz, start, or resumed-attempt responses", async () => {
    const quiz = await request(app).get(`/api/quizzes/${quizId}`).set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(quiz.status).toBe(200);
    expect(JSON.stringify(quiz.body)).not.toContain("isCorrect");
    const started = await createAttempt();
    expect(started.status).toBe(201);
    expect(JSON.stringify(started.body)).not.toContain("isCorrect");
    expect(JSON.stringify(started.body)).not.toContain("correctOptionIds");
    const resumed = await request(app).get(`/api/attempts/${started.body.id}`).set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(resumed.status).toBe(200);
    expect(JSON.stringify(resumed.body)).not.toContain("isCorrect");
  });

  test("grades single and exact multiple-choice answers without partial credit", async () => {
    const started = await createAttempt();
    const single = started.body.questions.find((question) => question.type === "single");
    const multiple = started.body.questions.find((question) => question.type === "multiple");
    const singleCorrect = await Quiz.findById(quizId);
    const savedSingle = singleCorrect.questions.id(single.id).options.find((option) => option.isCorrect);
    const multiCorrect = singleCorrect.questions.id(multiple.id).options.filter((option) => option.isCorrect);
    await request(app).patch(`/api/attempts/${started.body.id}/answer`).set("Authorization", `Bearer ${studentTokens[0]}`).send({ questionId: single.id, optionIds: [String(savedSingle._id)] });
    await request(app).patch(`/api/attempts/${started.body.id}/answer`).set("Authorization", `Bearer ${studentTokens[0]}`).send({ questionId: multiple.id, optionIds: [String(multiCorrect[0]._id)] });
    const submitted = await request(app).post(`/api/attempts/${started.body.id}/submit`).set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(submitted.status).toBe(200);
    expect(submitted.body.score).toBe(2);

    const completeAttempt = await createAttempt(studentTokens[1]);
    const completeSingle = completeAttempt.body.questions.find((question) => question.type === "single");
    const completeMultiple = completeAttempt.body.questions.find((question) => question.type === "multiple");
    const savedCompleteSingle = await request(app).patch(`/api/attempts/${completeAttempt.body.id}/answer`).set("Authorization", `Bearer ${studentTokens[1]}`).send({
      questionId: completeSingle.id,
      optionIds: [String(savedSingle._id)],
    });
    const savedCompleteMultiple = await request(app).patch(`/api/attempts/${completeAttempt.body.id}/answer`).set("Authorization", `Bearer ${studentTokens[1]}`).send({
      questionId: completeMultiple.id,
      optionIds: multiCorrect.map((option) => String(option._id)),
    });
    expect(savedCompleteSingle).toMatchObject({ status: 200 });
    expect(savedCompleteMultiple.status).toBe(200);
    const fullyCorrect = await request(app).post(`/api/attempts/${completeAttempt.body.id}/submit`).set("Authorization", `Bearer ${studentTokens[1]}`);
    expect(fullyCorrect.body.score).toBe(5);
  });

  test("hides detailed results until the quiz's end time has passed", async () => {
    const started = await createAttempt();
    const submitted = await request(app).post(`/api/attempts/${started.body.id}/submit`).set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(submitted.status).toBe(200);
    const hidden = await request(app).get(`/api/attempts/${started.body.id}/results`).set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(hidden.body.revealAnswers).toBe(false);
    expect(hidden.body).not.toHaveProperty("questions");
    await Quiz.findByIdAndUpdate(quizId, { endTime: new Date(Date.now() - 1000) });
    const revealed = await request(app).get(`/api/attempts/${started.body.id}/results`).set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(revealed.body.revealAnswers).toBe(true);
    expect(revealed.body.questions[0]).toHaveProperty("correctOptionIds");
  });

  test("ranks equal-score attempts by the shorter completion time", async () => {
    const start = new Date(Date.now() - 60000);
    await Promise.all([
      Attempt.create({ quizId, studentId: students[0]._id, startedAt: start, expiresAt: new Date(Date.now() + 300000), submittedAt: new Date(start.getTime() + 30000), score: 5 }),
      Attempt.create({ quizId, studentId: students[1]._id, startedAt: start, expiresAt: new Date(Date.now() + 300000), submittedAt: new Date(start.getTime() + 10000), score: 5 }),
      Attempt.create({ quizId, studentId: students[2]._id, startedAt: start, expiresAt: new Date(Date.now() + 300000), submittedAt: new Date(start.getTime() + 5000), score: 4 }),
    ]);
    const response = await request(app).get(`/api/quizzes/${quizId}/leaderboard`).set("Authorization", `Bearer ${studentTokens[0]}`);
    expect(response.status).toBe(200);
    expect(response.body.leaderboard.map((row) => row.studentName)).toEqual(["Student Two", "Student One", "Student Three"]);
  });

  test("enforces quiz availability and one-attempt-only policy", async () => {
    const upcoming = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${teacherToken}`).send(quizPayload(new Date(Date.now() + 60000)));
    expect(upcoming.status).toBe(201);
    expect((await createAttempt(studentTokens[0], upcoming.body.id)).status).toBe(403);
    const past = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${teacherToken}`).send(quizPayload(new Date(Date.now() - 7200000), new Date(Date.now() - 3600000)));
    expect(past.status).toBe(201);
    expect((await createAttempt(studentTokens[0], past.body.id)).status).toBe(403);
    expect((await createAttempt()).status).toBe(201);
    expect((await createAttempt()).status).toBe(409);
  });

  test("validates quiz schedules and prevents student self-registration as a teacher", async () => {
    const badQuiz = await request(app).post("/api/quizzes").set("Authorization", `Bearer ${teacherToken}`).send(quizPayload(new Date(), new Date(Date.now() - 1000)));
    expect(badQuiz.status).toBe(422);
    const registration = await request(app).post("/api/auth/register").send({ name: "New Student", email: "new@test.com", password: "password123", role: "teacher" });
    expect(registration.status).toBe(201);
    expect(registration.body.user.role).toBe("student");
  });

  test("seeds the demo accounts, active quiz, and closed attempts repeatably", async () => {
    const seedScript = resolve(process.cwd(), "src/seed.js");
    const environment = { ...process.env, MONGODB_URI: mongo.getUri() };
    const demoTeacher = await User.create({
      name: "Original Demo Teacher",
      email: "teacher@demo.com",
      passwordHash: await bcrypt.hash("old-password", 4),
      role: "teacher",
    });
    const unrelatedQuiz = await Quiz.create({
      teacherId: demoTeacher._id,
      title: "Teacher's own quiz",
      timeLimitSeconds: 120,
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 3600000),
      questions: quizPayload().questions,
    });
    await Attempt.create({
      quizId: unrelatedQuiz._id,
      studentId: students[0]._id,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 120000),
    });
    execFileSync(process.execPath, [seedScript], { cwd: process.cwd(), env: environment, stdio: "pipe" });
    const firstSeedCounts = {
      users: await User.countDocuments(),
      quizzes: await Quiz.countDocuments(),
      attempts: await Attempt.countDocuments(),
    };
    execFileSync(process.execPath, [seedScript], { cwd: process.cwd(), env: environment, stdio: "pipe" });
    expect(await User.countDocuments()).toBe(firstSeedCounts.users);
    expect(await Quiz.countDocuments()).toBe(firstSeedCounts.quizzes);
    expect(await Attempt.countDocuments()).toBe(firstSeedCounts.attempts);
    expect(firstSeedCounts.users).toBe(8);
    expect(firstSeedCounts.quizzes).toBe(4);
    expect(await Quiz.exists({ _id: unrelatedQuiz._id })).toBeTruthy();
    expect(await Attempt.exists({ quizId: unrelatedQuiz._id, studentId: students[0]._id })).toBeTruthy();
    const quizzes = await Quiz.find().sort({ title: 1 });
    expect(quizzes.filter((quiz) => quiz.title === "Quick Knowledge Check")).toHaveLength(1);
    expect(quizzes.find((quiz) => quiz.title === "Quick Knowledge Check").questions).toHaveLength(5);
    expect(await Attempt.countDocuments()).toBe(4);
    expect(await User.exists({ email: "teacher@demo.com", role: "teacher" })).toBeTruthy();
  });
});
