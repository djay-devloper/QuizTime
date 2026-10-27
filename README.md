# QuizTime — MERN timed quiz platform

QuizTime is a JavaScript-only full-stack application for teacher-authored timed quizzes. The Express/Mongoose API is authoritative for quiz windows, attempt deadlines, answer grading, and when correct answers are disclosed.

## Quick start

Requirements: Node.js 20+, npm, and MongoDB 6+ running locally (or a MongoDB Atlas URI).

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Set a long, unique JWT_SECRET in backend/.env.
npm run seed
npm run dev
```

The frontend is at <http://localhost:5173> and the API is at <http://localhost:4000/api>. Run automated backend tests with:

```bash
npm test
# or, from backend:
cd backend && npm test
```

Production frontend build:

```bash
npm run build
```

The backend reads `PORT`, `MONGODB_URI`, and `JWT_SECRET` from `backend/.env`. The Vite client reads `VITE_API_URL` from `frontend/.env`. Neither environment file should be committed. `.env.example` files document the settings.

## Demo logins

All seeded users use `password123`.

| Role | Email |
|---|---|
| Teacher | `teacher@demo.com` |
| Student | `student1@demo.com` |
| Student | `student2@demo.com` |
| Student | `student3@demo.com` |

Public registration creates student users only. Teacher accounts are provisioned by an administrator or the seed script.

## Features

- JWT sign-in, bcrypt password hashing, teacher/student role middleware, student registration.
- Teacher quiz creation and management with open/close time, duration, descriptions, single- and multiple-answer questions, option validation, and points.
- Student quiz dashboard with live status, one attempt per quiz, answer auto-saving, previous/next navigation, question palette, and a server-synchronized countdown.
- Per-attempt shuffled question and option order persisted in MongoDB so reload/resume retains the original arrangement.
- Server-enforced expiry and automatic grading of only saved answers. Single and multiple-choice answers require exact match for full points.
- Score and time-taken results after submission. Answer keys and detailed question feedback are withheld until the overall quiz end time has passed.
- Quiz leaderboard sorted by score descending and elapsed time ascending.
- Teacher analytics for completed attempt count, average score, and question error rates sorted from most-missed to least-missed.
- Responsive teacher dashboard, quiz builder, analytics, student player, results, and leaderboard.
- Seven Jest/Supertest integration tests backed by a dedicated `mongodb-memory-server` instance.

## Mongoose data model

```text
User (teacher) 1 ─── * Quiz 1 ─── * embedded Question 1 ─── * embedded Option
User (student) 1 ─── * Attempt * ─── 1 Quiz
Attempt ── questionOrder[] / optionOrder[] / answers[]
```

- **User:** display name, normalized unique email, bcrypt password hash (excluded from ordinary queries), and `teacher` or `student` role.
- **Quiz:** teacher reference, title/description, time limit and availability window, plus embedded questions and options. Embedded IDs provide stable question/option identifiers in saved attempts.
- **Attempt:** quiz/student references, unique quiz/student index, server start/expiry/submission timestamps, score, persisted shuffled IDs, and saved answers with server timestamps.

## Important security decisions

- **Server clock owns deadlines:** At attempt creation the API sets `expiresAt = min(startedAt + timeLimitSeconds, quiz.endTime)`. The UI countdown uses the returned `serverNow` and expiry for display only. Every answer save checks `Date.now()` on the API and rejects a late write with `403 { "error": "Time limit exceeded for this attempt" }`. Submission grades persisted answers whose server `savedAt` is not after expiry.
- **Answer-key stripping:** Student-facing quiz and attempt DTOs are built with explicit serializers that include option IDs and text only. They never serialize `isCorrect`. The results endpoint returns a score immediately after submission, and only adds correct option IDs and the question breakdown when server time is strictly later than the quiz `endTime`.
- **Validation and role checks:** Zod validates request bodies and ObjectId route parameters. Mongoose schema validation is a second boundary. Teachers can manage only their own quizzes; registration cannot select a teacher role.
- **Attempt shuffling:** The server shuffles IDs once when an attempt is created, stores the orders on the attempt, and reconstructs the same order on reload.
- **Isolated tests:** `mongodb-memory-server` gives Jest a fresh in-memory MongoDB instance, independent from local or production databases.

## Project layout

```text
backend/     Express API, Mongoose models, seed script, Jest/Supertest tests
frontend/    React + Vite + JSX, Tailwind CSS, React Router
```

All application source is plain JavaScript (`.js` / `.jsx`); TypeScript is not used.

## What's finished

Authentication and role protection, quiz creation/management, server-timed attempt lifecycle, saved answer and shuffle state, exact-match grading, protected results, teacher analytics, leaderboard, deterministic seed content, responsive UI, and backend integration coverage are implemented.

## What isn't / future improvements

- The demo is not deployed; production MongoDB hosting, API hosting, CI, and domain configuration remain.
- Further production hardening could add rate limiting, email verification, password reset, refresh-token rotation, audit logs, and teacher account provisioning workflows.
- The quiz editor currently creates quizzes and supports metadata edits/deletion, but does not yet support editing questions after attempts exist.
- Browser-level accessibility, screen-reader, and cross-device E2E testing can be expanded.
- High-concurrency load tests and MongoDB replica-set transaction tests are not included.

## AI tools used and how

Built with assistance from **Copilot SDK in VS Code**. AI assistance was used to scaffold the JavaScript/MERN structure, implement the API and React flows, draft test coverage and documentation, and iterate on build/test feedback. The project was validated with the commands above.

## Live Demo Link

Not deployed yet. Deployment target placeholder: **Vercel (frontend) + Render (backend)**.
