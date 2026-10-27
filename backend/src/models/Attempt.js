import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    selectedOptionIds: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
    savedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const optionOrderSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    optionIds: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
  },
  { _id: false },
);

const attemptSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    score: { type: Number, default: null },
    questionOrder: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
    optionOrder: { type: [optionOrderSchema], default: [] },
    answers: { type: [answerSchema], default: [] },
  },
  { timestamps: true },
);

attemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true });

export default mongoose.model("Attempt", attemptSchema);
