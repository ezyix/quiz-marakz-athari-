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
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const QuizState =
  mongoose.models.QuizState ||
  mongoose.model("QuizState", QuizStateSchema);

export default QuizState;
