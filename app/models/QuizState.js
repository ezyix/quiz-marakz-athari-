import mongoose from "mongoose";

const QuizStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
    },
    isStarted: {
      type: Boolean,
      default: false,
    },
    durationSeconds: {
      type: Number,
      default: 60,
      min: 60,
      max: 86400,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const existingQuizState = mongoose.models.QuizState;
if (existingQuizState && !existingQuizState.schema.path("durationSeconds")) {
  mongoose.deleteModel("QuizState");
}

const QuizState = mongoose.models.QuizState || mongoose.model("QuizState", QuizStateSchema);

export default QuizState;
