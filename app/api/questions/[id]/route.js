import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "../../../lib/mongodb";
import Question from "../../../models/Question";
import QuizState from "../../../models/QuizState";
import { isAdminRequest, isSameOriginRequest } from "../../../lib/auth";

const QUIZ_STATE_KEY = "global";

export async function DELETE(request, { params }) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { success: false, message: "Cross-origin request denied." },
        { status: 403 }
      );
    }

    if (!isAdminRequest(request)) {
      return NextResponse.json(
        { success: false, message: "Admin authentication required." },
        { status: 401 }
      );
    }

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