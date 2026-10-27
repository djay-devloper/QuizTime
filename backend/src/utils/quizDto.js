export function serializeQuiz(quiz, { includeCorrect = false } = {}) {
  return {
    id: String(quiz._id),
    title: quiz.title,
    description: quiz.description,
    timeLimitSeconds: quiz.timeLimitSeconds,
    startTime: quiz.startTime,
    endTime: quiz.endTime,
    teacherId: String(quiz.teacherId),
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: quiz.questions.map((question) => ({
      id: String(question._id),
      text: question.text,
      type: question.type,
      points: question.points,
      options: question.options.map((option) => ({
        id: String(option._id),
        text: option.text,
        ...(includeCorrect ? { isCorrect: option.isCorrect } : {}),
      })),
    })),
  };
}

export function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
