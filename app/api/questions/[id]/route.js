import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "../../../lib/mongodb";
import Question from "../../../models/Question";
import QuizState from "../../../models/QuizState";

const QUIZ_STATE_KEY = "global";

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid question ID." },
        { status: 400 }
      );
    }

    await connectDB();
    const quizState = await QuizState.findOne({ key: QUIZ_STATE_KEY })
      .select("isStarted")
      .lean();

    if (quizState?.isStarted) {
      return NextResponse.json(
        { success: false, message: "End the quiz before deleting questions." },
        { status: 409 }
      );
    }

    const question = await Question.findByIdAndDelete(id);

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Question deleted." });
  } catch (error) {
    console.error("Question deletion error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete question." },
      { status: 500 }
    );
  }
}