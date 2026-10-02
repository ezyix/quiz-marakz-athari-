import { NextResponse } from "next/server";
import connectDB from "../../lib/mongodb";
import Question from "../../models/Question";
import QuizState from "../../models/QuizState";

const QUIZ_STATE_KEY = "global";

export async function GET() {
  try {
    await connectDB();
    const questions = await Question.find({})
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    return NextResponse.json({ success: true, questions });
  } catch (error) {
    console.error("Question listing error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to load questions." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const options = Array.isArray(body.options)
      ? body.options.map((option) => typeof option === "string" ? option.trim() : "")
      : [];
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";

    if (
      !question ||
      question.length > 500 ||
      options.length !== 4 ||
      options.some((option) => !option || option.length > 200) ||
      new Set(options).size !== 4 ||
      !options.includes(answer)
    ) {
      return NextResponse.json(
        { success: false, message: "Enter a question, four unique options, and select the correct answer." },
        { status: 400 }
      );
    }

    await connectDB();
    const quizState = await QuizState.findOne({ key: QUIZ_STATE_KEY })
      .select("isStarted")
      .lean();

    if (quizState?.isStarted) {
      return NextResponse.json(
        { success: false, message: "End the quiz before adding questions." },
        { status: 409 }
      );
    }

    const createdQuestion = await Question.create({ question, options, answer });

    return NextResponse.json(
      { success: true, question: createdQuestion.toObject() },
      { status: 201 }
    );
  } catch (error) {
    console.error("Question creation error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to add question." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
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

    const result = await Question.deleteMany({});

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Question deletion error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete questions." },
      { status: 500 }
    );
  }
}