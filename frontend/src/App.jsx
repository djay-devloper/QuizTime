import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BarChart3, BookOpenCheck, Check, Clock3, LogOut, Plus, Trophy } from "lucide-react";
import { api, getErrorMessage } from "./api.js";

function readUser() {
  try {
    return JSON.parse(localStorage.getItem("quiztime-user") || "null");
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState(readUser);
  const navigate = useNavigate();

  function signOut() {
    localStorage.removeItem("quiztime-token");
    localStorage.removeItem("quiztime-user");
    setUser(null);
    navigate("/");
  }

  const rolePage = (role, element) => user?.role === role ? element : <Navigate to="/" replace />;
  return (
    <div className="app-shell">
      {user && <header className="topbar">
        <Link to="/" className="brand"><span className="brand-mark"><BookOpenCheck size={19} /></span>QuizTime</Link>
        <div className="user-area"><span>{user.name}<small>{user.role}</small></span><button className="icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={18} /></button></div>
      </header>}
      <main className={user ? "page-shell" : "auth-shell"}>
        <Routes>
          <Route path="/" element={user ? <Dashboard user={user} /> : <Auth onLogin={setUser} />} />
          <Route path="/quizzes/new" element={rolePage("teacher", <QuizBuilder />)} />
          <Route path="/quizzes/:quizId/edit" element={rolePage("teacher", <QuizEditor />)} />
          <Route path="/attempts/:attemptId" element={rolePage("student", <Player />)} />
          <Route path="/attempts/:attemptId/results" element={rolePage("student", <Results />)} />
          <Route path="/quizzes/:quizId/leaderboard" element={user ? <Leaderboard /> : <Navigate to="/" replace />} />
          <Route path="/quizzes/:quizId/analytics" element={rolePage("teacher", <Analytics />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Auth({ onLogin }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const { data } = await api.post(register ? "/auth/register" : "/auth/login", form);
      localStorage.setItem("quiztime-token", data.token);
      localStorage.setItem("quiztime-user", JSON.stringify(data.user));
      onLogin(data.user);
      navigate("/");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return <section className="auth-card">
    <div className="brand auth-brand"><span className="brand-mark"><BookOpenCheck size={20} /></span>QuizTime</div>
    <p className="eyebrow">LEARN WITH MOMENTUM</p>
    <h1>{register ? "Create your student account" : "Welcome back"}</h1>
    <p className="muted">{register ? "Join a quiz and put your knowledge to the test." : "Sign in to continue to your quizzes."}</p>
    <ErrorBanner message={error} />
    <form className="form-stack" onSubmit={submit}>
      {register && <label>Your name<input name="name" autoComplete="name" required maxLength={100} /></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} required /></label>
      <button className="button button-primary full-button" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
    </form>
    <p className="auth-switch">{register ? "Already have an account?" : "New to QuizTime?"} <button className="text-button" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Sign in" : "Create a student account"}</button></p>
    <div className="demo-hint"><strong>Demo accounts</strong><span>Teacher: teacher@demo.com · password123</span><span>Student: student1@demo.com · password123</span></div>
  </section>;
}

function Dashboard({ user }) {
  const [quizzes, setQuizzes] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/quizzes");
      setQuizzes(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function startQuiz(quiz) {
    setBusyId(quiz.id);
    setError("");
    try {
      const { data } = await api.post(`/quizzes/${quiz.id}/attempts`);
      navigate(`/attempts/${data.id}`);
    } catch (requestError) {
      if (requestError.response?.status === 409 && requestError.response.data?.attemptId) {
        navigate(`/attempts/${requestError.response.data.attemptId}`);
      } else {
        setError(getErrorMessage(requestError));
      }
    } finally {
      setBusyId("");
    }
  }

  async function deleteQuiz(quiz) {
    if (!window.confirm(`Delete "${quiz.title}" and its attempts?`)) return;
    try {
      await api.delete(`/quizzes/${quiz.id}`);
      setQuizzes((items) => items.filter((item) => item.id !== quiz.id));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  const activeCount = quizzes.filter((quiz) => quiz.status === "ACTIVE").length;
  const submittedCount = quizzes.filter((quiz) => quiz.status === "SUBMITTED").length;
  const attempts = quizzes.reduce((sum, quiz) => sum + (quiz.attemptCount || 0), 0);
  return <div>
    <section className="hero-row"><div><p className="eyebrow">{user.role.toUpperCase()} WORKSPACE</p><h1>{user.role === "teacher" ? `Good to see you, ${user.name.split(" ")[0]}` : "Ready for your next challenge?"}</h1><p className="muted">{user.role === "teacher" ? "Create quizzes, track progress, and see what your class has mastered." : "Your quizzes, all in one place. Take your time—until the timer starts."}</p></div>
      {user.role === "teacher" && <Link to="/quizzes/new" className="button button-primary"><Plus size={18} /> Create quiz</Link>}
    </section>
    <ErrorBanner message={error} />
    <div className="stat-grid">
      <Stat label={user.role === "teacher" ? "Your quizzes" : "Available quizzes"} value={quizzes.length} icon={<BookOpenCheck />} />
      <Stat label={user.role === "teacher" ? "Student attempts" : "Active now"} value={user.role === "teacher" ? attempts : activeCount} icon={<Clock3 />} />
      <Stat label={user.role === "teacher" ? "Analytics ready" : "Submitted"} value={user.role === "teacher" ? quizzes.length : submittedCount} icon={<Trophy />} />
    </div>
    <div className="section-heading"><div><p className="eyebrow">{user.role === "teacher" ? "QUIZ LIBRARY" : "YOUR QUIZZES"}</p><h2>{user.role === "teacher" ? "Manage your quizzes" : "Available quizzes"}</h2></div></div>
    {loading ? <div className="empty-state">Loading your quizzes…</div> : quizzes.length === 0 ? <div className="empty-state"><BookOpenCheck size={28} /><h3>No quizzes yet</h3><p>{user.role === "teacher" ? "Create your first quiz to get started." : "Your teacher hasn't published a quiz yet."}</p></div> :
      <div className="quiz-grid">{quizzes.map((quiz) => <article className="quiz-card" key={quiz.id}>
        <div className="card-top"><span className={`status status-${(quiz.status || "active").toLowerCase()}`}>{user.role === "teacher" ? "MANAGING" : quiz.status}</span><span className="question-count">{quiz.questions.length} questions</span></div>
        <h3>{quiz.title}</h3><p className="muted card-description">{quiz.description || "No description provided."}</p>
        <div className="quiz-meta"><span><Clock3 size={15} />{formatDuration(quiz.timeLimitSeconds)}</span><span>{new Date(quiz.startTime).toLocaleDateString()}</span></div>
        <div className="card-actions">
          {user.role === "student" && quiz.status === "ACTIVE" && !quiz.hasAttempt && <button className="button button-primary" disabled={busyId === quiz.id} onClick={() => void startQuiz(quiz)}>{busyId === quiz.id ? "Starting…" : "Start quiz"}<ArrowRight size={16} /></button>}
          {user.role === "student" && quiz.hasAttempt && quiz.status !== "SUBMITTED" && quiz.attemptId && <Link className="button button-primary" to={`/attempts/${quiz.attemptId}`}>{quiz.status === "ACTIVE" ? "Resume quiz" : "Finish submission"}<ArrowRight size={16} /></Link>}
          {user.role === "student" && quiz.status === "SUBMITTED" && quiz.attemptId && <Link className="button button-secondary" to={`/attempts/${quiz.attemptId}/results`}>View score<ArrowRight size={16} /></Link>}
          <Link className="button button-secondary" to={`/quizzes/${quiz.id}/leaderboard`}><Trophy size={16} />Leaderboard</Link>
          {user.role === "teacher" && <Link className="button button-secondary" to={`/quizzes/${quiz.id}/analytics`}><BarChart3 size={16} />Analytics</Link>}
          {user.role === "teacher" && <Link className="button button-secondary" to={`/quizzes/${quiz.id}/edit`}>Edit details</Link>}
          {user.role === "teacher" && <button className="button button-secondary" onClick={() => void deleteQuiz(quiz)}>Delete</button>}
        </div>
      </article>)}</div>}
  </div>;
}

function QuizBuilder() {
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const startDefault = toLocalDateTime(new Date(Date.now() - 60000));
  const endDefault = toLocalDateTime(new Date(Date.now() + 7 * 86400000));

  function updateQuestion(index, patch) {
    setQuestions((items) => items.map((item, current) => current === index ? { ...item, ...patch } : item));
  }
  function updateOption(questionIndex, optionIndex, patch) {
    const question = questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.map((option, current) => current === optionIndex ? { ...option, ...patch } : option),
    });
  }
  function markCorrect(questionIndex, optionIndex, checked) {
    const question = questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.map((option, current) => ({
        ...option,
        isCorrect: current === optionIndex ? checked : question.type === "single" ? false : option.isCorrect,
      })),
    });
  }
  function setType(index, type) {
    const question = questions[index];
    const firstCorrect = question.options.findIndex((option) => option.isCorrect);
    updateQuestion(index, {
      type,
      options: question.options.map((option, optionIndex) => ({
        ...option,
        isCorrect: type === "single" ? optionIndex === Math.max(0, firstCorrect) : option.isCorrect,
      })),
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      timeLimitSeconds: Number(form.get("timeLimitSeconds")),
      startTime: new Date(form.get("startTime")).toISOString(),
      endTime: new Date(form.get("endTime")).toISOString(),
      questions,
    };
    try {
      await api.post("/quizzes", payload);
      navigate("/");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return <div className="content-narrow">
    <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link>
    <div className="page-title"><p className="eyebrow">QUIZ BUILDER</p><h1>Create a new quiz</h1><p className="muted">Set a time window and add questions for your students.</p></div>
    <ErrorBanner message={error} />
    <form className="builder-form" onSubmit={(event) => void submit(event)}>
      <section className="panel form-grid"><h2 className="panel-title">Quiz details</h2>
        <label className="span-two">Quiz title<input name="title" placeholder="e.g. Biology midterm" required maxLength={160} /></label>
        <label className="span-two">Description<textarea name="description" rows={3} maxLength={2000} placeholder="What should students know before starting?" /></label>
        <label>Time limit (seconds)<input name="timeLimitSeconds" type="number" min={10} max={86400} defaultValue={600} required /></label>
        <label>Opens at<input name="startTime" type="datetime-local" defaultValue={startDefault} required /></label>
        <label>Closes at<input name="endTime" type="datetime-local" defaultValue={endDefault} required /></label>
      </section>
      {questions.map((question, index) => <section className="panel question-builder" key={index}>
        <div className="question-builder-header"><h2>Question {index + 1}</h2>{questions.length > 1 && <button type="button" className="text-button danger-text" onClick={() => setQuestions((items) => items.filter((_, current) => current !== index))}>Remove</button>}</div>
        <label>Question text<input value={question.text} onChange={(event) => updateQuestion(index, { text: event.target.value })} required maxLength={2000} placeholder="Write your question…" /></label>
        <div className="form-grid"><label>Question type<select value={question.type} onChange={(event) => setType(index, event.target.value)}><option value="single">Single choice</option><option value="multiple">Multiple choice</option></select></label><label>Points<input type="number" min={1} max={1000} value={question.points} onChange={(event) => updateQuestion(index, { points: Number(event.target.value) })} required /></label></div>
        <div className="option-list"><div className="option-label">Options <small>Select the correct {question.type === "single" ? "answer" : "answers"}</small></div>
          {question.options.map((option, optionIndex) => <div className="builder-option" key={optionIndex}><input type="checkbox" aria-label={`Mark option ${optionIndex + 1} correct`} checked={option.isCorrect} onChange={(event) => markCorrect(index, optionIndex, event.target.checked)} /><input value={option.text} onChange={(event) => updateOption(index, optionIndex, { text: event.target.value })} placeholder={`Option ${optionIndex + 1}`} required maxLength={500} /><button type="button" className="remove-option" aria-label="Remove option" disabled={question.options.length <= 2} onClick={() => updateQuestion(index, { options: question.options.filter((_, current) => current !== optionIndex) })}>×</button></div>)}
          <button type="button" className="text-button" disabled={question.options.length >= 10} onClick={() => updateQuestion(index, { options: [...question.options, { text: "", isCorrect: false }] })}><Plus size={15} /> Add option</button>
        </div>
      </section>)}
      <button type="button" className="button button-secondary add-question" disabled={questions.length >= 100} onClick={() => setQuestions((items) => [...items, emptyQuestion()])}><Plus size={17} /> Add another question</button>
      <div className="form-footer"><Link to="/" className="button button-secondary">Cancel</Link><button className="button button-primary" disabled={busy}>{busy ? "Publishing…" : "Publish quiz"}<ArrowRight size={17} /></button></div>
    </form>
  </div>;
}

function QuizEditor() {
  const { quizId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/quizzes/${quizId}`).then(({ data }) => setQuiz(data)).catch((requestError) => setError(getErrorMessage(requestError)));
  }, [quizId]);

  async function submit(event) {
    event.preventDefault();
    if (!quiz) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api.patch(`/quizzes/${quizId}`, {
        title: form.get("title"),
        description: form.get("description"),
        timeLimitSeconds: Number(form.get("timeLimitSeconds")),
        startTime: new Date(form.get("startTime")).toISOString(),
        endTime: new Date(form.get("endTime")).toISOString(),
      });
      navigate("/");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!quiz) return <div className="content-narrow"><Link to="/" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link><ErrorBanner message={error} />{!error && <div className="empty-state">Loading quiz settings…</div>}</div>;
  return <div className="content-narrow">
    <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link>
    <div className="page-title"><p className="eyebrow">QUIZ SETTINGS</p><h1>Edit quiz details</h1><p className="muted">Question content stays unchanged for existing student attempts.</p></div>
    <ErrorBanner message={error} />
    <form className="panel builder-form" onSubmit={(event) => void submit(event)}>
      <label>Quiz title<input name="title" defaultValue={quiz.title} required maxLength={160} /></label>
      <label>Description<textarea name="description" rows={3} defaultValue={quiz.description} maxLength={2000} /></label>
      <label>Time limit (seconds)<input name="timeLimitSeconds" type="number" min={10} max={86400} defaultValue={quiz.timeLimitSeconds} required /></label>
      <label>Opens at<input name="startTime" type="datetime-local" defaultValue={toLocalDateTime(new Date(quiz.startTime))} required /></label>
      <label>Closes at<input name="endTime" type="datetime-local" defaultValue={toLocalDateTime(new Date(quiz.endTime))} required /></label>
      <div className="form-footer"><Link to="/" className="button button-secondary">Cancel</Link><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}<Check size={16} /></button></div>
    </form>
  </div>;
}

function Player() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState([]);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const question = attempt?.questions[current];

  useEffect(() => {
    let active = true;
    api.get(`/attempts/${attemptId}`).then(({ data }) => {
      if (!active) return;
      setAttempt(data);
      setRemaining(Math.max(0, Math.ceil((new Date(data.expiresAt).getTime() - new Date(data.serverNow).getTime()) / 1000)));
      const index = data.questions.findIndex((item) => item.selectedOptionIds?.length);
      const initialIndex = index < 0 ? 0 : index;
      setCurrent(initialIndex);
      setSelected(data.questions[initialIndex]?.selectedOptionIds || []);
      if (data.submittedAt) navigate(`/attempts/${attemptId}/results`, { replace: true });
    }).catch((requestError) => setError(getErrorMessage(requestError))).finally(() => setLoading(false));
    return () => { active = false; };
  }, [attemptId, navigate]);

  useEffect(() => {
    if (!attempt || attempt.submittedAt) return undefined;
    const remainingAtSync = new Date(attempt.expiresAt).getTime() - new Date(attempt.serverNow).getTime();
    const monotonicStart = performance.now();
    const tick = () => setRemaining(Math.max(0, Math.ceil((remainingAtSync - (performance.now() - monotonicStart)) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [attempt]);

  const submitAttempt = useCallback(async () => {
    if (!attempt || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/attempts/${attempt.id}/submit`);
      navigate(`/attempts/${attempt.id}/results`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setSubmitting(false);
    }
  }, [attempt, navigate, submitting]);

  useEffect(() => {
    if (attempt && !loading && remaining === 0 && !attempt.submittedAt) void submitAttempt();
  }, [attempt, loading, remaining, submitAttempt]);

  async function saveAnswer(questionId, optionIds) {
    if (!attempt) return false;
    setSaving(true);
    setError("");
    try {
      await api.patch(`/attempts/${attempt.id}/answer`, { questionId, optionIds });
      setAttempt((previous) => ({
        ...previous,
        questions: previous.questions.map((item) => item.id === questionId ? { ...item, selectedOptionIds: optionIds } : item),
      }));
      return true;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function changeAnswer(optionId) {
    if (!question || saving || remaining <= 0) return;
    const next = question.type === "single"
      ? [optionId]
      : selected.includes(optionId) ? selected.filter((item) => item !== optionId) : [...selected, optionId];
    setSelected(next);
    void saveAnswer(question.id, next);
  }

  async function goTo(index) {
    if (!attempt || index < 0 || index >= attempt.questions.length || saving) return;
    if (question && !(await saveAnswer(question.id, selected))) return;
    setCurrent(index);
    setSelected(attempt.questions[index].selectedOptionIds || []);
  }

  if (loading) return <div className="empty-state">Loading your attempt…</div>;
  if (!attempt || !question) return <div className="content-narrow"><ErrorBanner message={error || "This attempt could not be loaded."} /><Link to="/" className="button button-secondary">Return to dashboard</Link></div>;
  return <div className="player-wrap">
    <Link to="/" className="back-link"><ArrowLeft size={16} /> Leave quiz</Link>
    <div className="player-header"><div><p className="eyebrow">TIMED QUIZ</p><h1>{attempt.quiz.title}</h1></div><div className={`timer ${remaining < 60 ? "timer-warning" : ""}`}><Clock3 size={18} />{formatClock(remaining)}</div></div>
    <div className="progress-meta"><span>Question {current + 1} <span className="muted">of {attempt.questions.length}</span></span><span>{saving ? "Saving…" : "All changes saved"}</span></div>
    <div className="progress-track"><div style={{ width: `${((current + 1) / attempt.questions.length) * 100}%` }} /></div>
    <ErrorBanner message={error} />
    <section className="panel player-question"><div className="question-kicker"><span>QUESTION {String(current + 1).padStart(2, "0")}</span><span>{question.points} {question.points === 1 ? "point" : "points"} · {question.type === "single" ? "Choose one" : "Choose all that apply"}</span></div><h2>{question.text}</h2>
      <div className="answer-options">{question.options.map((option, index) => <button key={option.id} className={`answer-option ${selected.includes(option.id) ? "answer-selected" : ""}`} onClick={() => changeAnswer(option.id)} disabled={saving || remaining <= 0}><span className={question.type === "single" ? "radio-dot" : "check-box"}>{selected.includes(option.id) && <Check size={14} />}</span><span>{option.text}</span><kbd>{index + 1}</kbd></button>)}</div>
    </section>
    <div className="player-controls"><button className="button button-secondary" onClick={() => void goTo(current - 1)} disabled={current === 0 || saving}><ArrowLeft size={16} /> Previous</button><span className="muted">{current + 1} / {attempt.questions.length}</span>{current < attempt.questions.length - 1 ? <button className="button button-primary" onClick={() => void goTo(current + 1)} disabled={saving}>Next question <ArrowRight size={16} /></button> : <button className="button button-primary" onClick={() => void submitAttempt()} disabled={submitting}>{submitting ? "Submitting…" : "Submit quiz"}<Check size={17} /></button>}</div>
    <div className="question-nav">{attempt.questions.map((item, index) => <button key={item.id} className={`question-dot ${index === current ? "question-dot-current" : ""} ${(item.selectedOptionIds?.length || 0) ? "question-dot-answered" : ""}`} onClick={() => void goTo(index)} aria-label={`Go to question ${index + 1}`}>{index + 1}</button>)}</div>
  </div>;
}

function Results() {
  const { attemptId } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get(`/attempts/${attemptId}/results`).then(({ data }) => setResult(data)).catch((requestError) => setError(getErrorMessage(requestError)));
  }, [attemptId]);
  return <div className="content-narrow">
    <Link to="/" className="back-link"><ArrowLeft size={16} /> Dashboard</Link><ErrorBanner message={error} />
    {result && <><div className="results-hero"><span className="result-icon"><Check size={26} /></span><p className="eyebrow">QUIZ SUBMITTED</p><h1>{result.quizTitle}</h1><div className="score-display">{result.score}<small>points</small></div><p className="muted">Time taken: {formatDuration(Math.round(result.timeTakenSeconds))}</p><p className="muted">{result.revealAnswers ? "Your answer breakdown is ready." : "Answer details will appear when the quiz window closes."}</p></div>
      {result.questions && <section className="results-breakdown">{result.questions.map((question, index) => <article className="panel result-question" key={question.questionId}><div className="question-kicker"><span>QUESTION {index + 1}</span><span className={question.correct ? "correct-label" : "incorrect-label"}>{question.correct ? "Correct" : "Not quite"} · {question.points} pts</span></div><h3>{question.text}</h3><div className="result-options">{question.options.map((option) => <div className={`result-option ${question.correctOptionIds.includes(option.id) ? "result-correct" : question.selectedOptionIds.includes(option.id) ? "result-wrong" : ""}`} key={option.id}>{option.text}<span>{question.correctOptionIds.includes(option.id) ? "Correct answer" : question.selectedOptionIds.includes(option.id) ? "Your answer" : ""}</span></div>)}</div></article>)}</section>}
      <Link to="/" className="button button-primary full-button">Back to dashboard</Link></>}
  </div>;
}

function Leaderboard() {
  const { quizId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get(`/quizzes/${quizId}/leaderboard`).then(({ data: value }) => setData(value)).catch((requestError) => setError(getErrorMessage(requestError))); }, [quizId]);
  return <div className="content-narrow"><Link to="/" className="back-link"><ArrowLeft size={16} /> Dashboard</Link><div className="page-title"><p className="eyebrow">LEADERBOARD</p><h1>{data?.quizTitle || "Quiz rankings"}</h1><p className="muted">Ranked by score, then fastest completion time.</p></div><ErrorBanner message={error} />
    <section className="panel leaderboard">{!data ? "Loading rankings…" : data.leaderboard.length === 0 ? <div className="empty-state"><Trophy size={28} /><p>No completed attempts yet.</p></div> : data.leaderboard.map((row, index) => <div className="leader-row" key={`${row.studentName}-${index}`}><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><div className="leader-avatar">{row.studentName.slice(0, 1)}</div><strong>{row.studentName}</strong><span className="leader-time">{formatDuration(Math.round(row.timeTakenSeconds))}</span><b>{row.score} pts</b></div>)}</section>
  </div>;
}

function Analytics() {
  const { quizId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get(`/quizzes/${quizId}/analytics`).then(({ data: value }) => setData(value)).catch((requestError) => setError(getErrorMessage(requestError))); }, [quizId]);
  const questions = useMemo(() => [...(data?.questions || [])].sort((a, b) => b.errorRatePercent - a.errorRatePercent), [data]);
  return <div><Link to="/" className="back-link"><ArrowLeft size={16} /> Dashboard</Link><div className="page-title"><p className="eyebrow">TEACHER ANALYTICS</p><h1>{data?.quizTitle || "Quiz performance"}</h1><p className="muted">A clear view of student performance and question difficulty.</p></div><ErrorBanner message={error} />
    {data && <><div className="stat-grid"><Stat label="Completed attempts" value={data.totalAttempts} icon={<BookOpenCheck />} /><Stat label="Average score" value={data.averageScore} icon={<BarChart3 />} /><Stat label="Questions" value={data.questions.length} icon={<Check />} /></div><section className="panel analytics-panel"><h2>Question breakdown</h2><p className="muted">Questions most frequently missed appear first.</p>{questions.map((question, index) => <div className="analytics-row" key={question.questionId}><div className="analytics-copy"><strong>Q{index + 1}. {question.text}</strong><span>{question.incorrect} of {question.attempts} incorrect</span></div><div className="analytics-bar"><span style={{ width: `${question.errorRatePercent}%` }} /></div><b>{question.errorRatePercent}%</b></div>)}</section></>}
  </div>;
}

function Stat({ label, value, icon }) {
  return <article className="stat-card"><span className="stat-icon">{icon}</span><div><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div></article>;
}

function ErrorBanner({ message }) {
  return message ? <div className="error-banner" role="alert">{message}</div> : null;
}

function emptyQuestion() {
  return {
    text: "",
    type: "single",
    points: 1,
    options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }],
  };
}

function formatDuration(seconds) {
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${seconds}s`;
}

function formatClock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function toLocalDateTime(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
