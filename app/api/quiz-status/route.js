import { NextResponse } from "next/server";
import connectDB from "../../lib/mongodb";
import Question from "../../models/Question";
import QuizState from "../../models/QuizState";
import { isAdminRequest, isSameOriginRequest } from "../../lib/auth";

const QUIZ_STATE_KEY = "global";

export async function GET() {
  try {
    await connectDB();

    const state = await QuizState.findOne({ key: QUIZ_STATE_KEY }).lean();

    return NextResponse.json({
      success: true,
      isStarted: Boolean(state?.isStarted),
      durationSeconds: state?.durationSeconds ?? 60,
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

    const requestBody = await request.json();
    const body = requestBody && typeof requestBody === "object" ? requestBody : {};
    const hasStartedUpdate = Object.prototype.hasOwnProperty.call(body, "isStarted");
    const hasDurationUpdate = Object.prototype.hasOwnProperty.call(body, "durationSeconds");

    if (!hasStartedUpdate && !hasDurationUpdate) {
      return NextResponse.json(
        { success: false, message: "Provide a quiz setting to update." },
        { status: 400 }
      );
    }

    const durationSeconds = Number(body.durationSeconds);
    if (
      hasDurationUpdate &&
      (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86400)
    ) {
      return NextResponse.json(
        { success: false, message: "Quiz duration must be between 1 minute and 24 hours." },
        { status: 400 }
      );
    }

    await connectDB();

    if (hasStartedUpdate && body.isStarted && !(await Question.exists({}))) {
      return NextResponse.json(
        {
          success: false,
          message: "Add at least one question before starting the quiz.",
        },
        { status: 409 }
      );
    }

    const currentState = await QuizState.findOne({ key: QUIZ_STATE_KEY }).lean();
    if (hasDurationUpdate && currentState?.isStarted) {
      return NextResponse.json(
        { success: false, message: "End the quiz before changing its duration." },
        { status: 409 }
      );
    }

    const update = { updatedAt: new Date() };
    if (hasStartedUpdate) {
      update.isStarted = Boolean(body.isStarted);
    }
    if (hasDurationUpdate) {
      update.durationSeconds = durationSeconds;
    }

    const state = await QuizState.findOneAndUpdate(
      { key: QUIZ_STATE_KEY },
      update,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return NextResponse.json({
      success: true,
      isStarted: Boolean(state?.isStarted),
      durationSeconds: state?.durationSeconds ?? 60,
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