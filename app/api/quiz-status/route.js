import { NextResponse } from "next/server";
import connectDB from "../../lib/mongodb";
import QuizState from "../../models/QuizState";

const QUIZ_STATE_KEY = "global";

export async function GET() {
  try {
    await connectDB();

    const state = await QuizState.findOne({ key: QUIZ_STATE_KEY }).lean();

    return NextResponse.json({
      success: true,
      isStarted: Boolean(state?.isStarted),
    });
  } catch (error) {
    console.error("Quiz status fetch error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load quiz status.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const isStarted = Boolean(body?.isStarted);

    await connectDB();

    const state = await QuizState.findOneAndUpdate(
      { key: QUIZ_STATE_KEY },
      { isStarted, updatedAt: new Date() },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return NextResponse.json({
      success: true,
      isStarted: Boolean(state?.isStarted),
    });
  } catch (error) {
    console.error("Quiz status update error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update quiz status.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  return PATCH(request);
}