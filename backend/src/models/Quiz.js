import mongoose from "mongoose";

const optionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 500 },
    isCorrect: { type: Boolean, required: true, default: false },
  },
  { _id: true },
);

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    type: { type: String, enum: ["single", "multiple"], required: true },
    points: { type: Number, required: true, min: 1, max: 1000 },
    options: { type: [optionSchema], validate: [(options) => options.length >= 2 && options.length <= 10, "Each question needs between 2 and 10 options"] },
  },
  { _id: true },
);

const quizSchema = new mongoose.Schema(
  {
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    timeLimitSeconds: { type: Number, required: true, min: 10, max: 86400 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    questions: { type: [questionSchema], validate: [(questions) => questions.length >= 1 && questions.length <= 100, "A quiz needs at least one question"] },
  },
  { timestamps: true },
);

quizSchema.pre("validate", function validateQuiz(next) {
  if (this.endTime <= this.startTime) this.invalidate("endTime", "End time must be after start time");
  this.questions.forEach((question, index) => {
    const correctCount = question.options.filter((option) => option.isCorrect).length;
    if (correctCount < 1) this.invalidate(`questions.${index}.options`, "Choose at least one correct option");
    if (question.type === "single" && correctCount !== 1) {
      this.invalidate(`questions.${index}.options`, "Single-choice questions need exactly one correct option");
    }
  });
  next();
});

export default mongoose.model("Quiz", quizSchema);
