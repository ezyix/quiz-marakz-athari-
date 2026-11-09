import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (options) => options.length === 4,
        message: "Each question must have exactly four options.",
      },
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

QuestionSchema.index({ createdAt: 1, _id: 1 });

const Question =
  mongoose.models.Question || mongoose.model("Question", QuestionSchema);

export default Question;