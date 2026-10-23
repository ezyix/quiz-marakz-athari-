import { NextResponse } from "next/server";
import connectDB from "../../lib/mongodb";
import Participant from "../../models/Participant";
import Question from "../../models/Question";
import QuizState from "../../models/QuizState";
import {
  PARTICIPANT_COOKIE,
  createParticipantSession,
  getParticipantId,
  isAdminRequest,
  isSameOriginRequest,
  participantSessionMaxAge,
  sessionCookieOptions,
} from "../../lib/auth";
import {
  getCountries,
  parsePhoneNumberFromString,
} from "libphonenumber-js";

const QUIZ_STATE_KEY = "global";

// ==========================================
// GET
// List participants and dashboard summary
// ==========================================

export async function GET(request) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json(
        { success: false, message: "Admin authentication required." },
        { status: 401 }
      );
    }

    await connectDB();

    const participants = await Participant.find({})
      .sort({ createdAt: -1 })
      .lean();

    const completed = participants.filter(
      (participant) => participant.status === "completed"
    );

    const durations = completed
      .filter(
        (participant) =>
          participant.startedAt && participant.completedAt
      )
      .map(
        (participant) =>
          new Date(participant.completedAt).getTime() -
          new Date(participant.startedAt).getTime()
      )
      .filter((duration) => duration >= 0);

    const fastestFinish = durations.length
      ? Math.min(...durations)
      : null;

    return NextResponse.json({
      success: true,
      participants,
      summary: {
        total: participants.length,
        male: participants.filter(
          (participant) => participant.gender === "Male" && participant.age >= 13
        ).length,
        female: participants.filter(
          (participant) => participant.gender === "Female" && participant.age >= 13
        ).length,
        kids: participants.filter(
          (participant) => participant.age < 13
        ).length,
        kidsMale: participants.filter(
          (participant) => participant.age < 13 && participant.gender === "Male"
        ).length,
        kidsFemale: participants.filter(
          (participant) => participant.age < 13 && participant.gender === "Female"
        ).length,
        inProgress: participants.filter(
          (participant) => participant.status === "attending"
        ).length,
        completed: completed.length,
        fastestFinish,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Participant listing error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load participants.",
      },
      { status: 500 }
    );
  }
}


// ==========================================
// POST
// Create participant
// ==========================================

export async function POST(request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { success: false, message: "Cross-origin request denied." },
        { status: 403 }
      );
    }

    await connectDB();

    const quizState = await QuizState.findOne({ key: QUIZ_STATE_KEY })
      .select("isStarted")
      .lean();
    if (!quizState?.isStarted) {
      return NextResponse.json(
        { success: false, message: "Registration is closed." },
        { status: 409 }
      );
    }

    const body = await request.json();

    const {
      fullName,
      gender,
      age,
      whatsapp,
      phoneCountry,
    } = body;

    // Validation

    if (
      typeof fullName !== "string" ||
      !fullName.trim() ||
      !gender ||
      !age ||
      typeof whatsapp !== "string" ||
      !whatsapp.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "All fields are required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!["Male", "Female"].includes(gender)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid gender.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      Number(age) < 1 ||
      Number(age) > 120
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid age.",
        },
        {
          status: 400,
        }
      );
    }

    if (typeof phoneCountry !== "string" || !getCountries().includes(phoneCountry)) {
      return NextResponse.json(
        { success: false, message: "Select a valid country calling code." },
        { status: 400 }
      );
    }

    const parsedPhone = parsePhoneNumberFromString(whatsapp.trim(), phoneCountry);
    if (!parsedPhone?.isValid()) {
      return NextResponse.json(
        { success: false, message: "Enter a valid WhatsApp number for the selected country." },
        { status: 400 }
      );
    }

    const normalizedName = fullName.trim().replace(/\s+/g, " ").toUpperCase();
    const sameNameParticipants = await Participant.find({ fullName: normalizedName })
      .select("whatsapp")
      .lean();
    const isDuplicate = sameNameParticipants.some((participant) => {
      const existingPhone = parsePhoneNumberFromString(
        participant.whatsapp,
        phoneCountry
      );
      return existingPhone?.number === parsedPhone.number;
    });

    if (isDuplicate) {
      return NextResponse.json(
        { success: false, message: "This name and WhatsApp number have already been used." },
        { status: 409 }
      );
    }

    // Generate unique participant ID

    const participantId =
      `P-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;
    const participantToken = createParticipantSession(participantId);

    // Create participant

    const participant =
      await Participant.create({
        participantId,
        fullName: normalizedName,
        gender,
        age: Number(age),
        whatsapp: parsedPhone.number,
        status: "attending",
        startedAt: new Date(),
      });

    const response = NextResponse.json(
      {
        success: true,
        message: "Participant registered successfully.",
        participant: {
          participantId:
            participant.participantId,
          fullName:
            participant.fullName,
          status:
            participant.status,
          startedAt:
            participant.startedAt,
        },
      },
      {
        status: 201,
      }
    );

    response.cookies.set(
      PARTICIPANT_COOKIE,
      participantToken,
      sessionCookieOptions(participantSessionMaxAge)
    );

    return response;
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: "This name and WhatsApp number have already been used." },
        { status: 409 }
      );
    }

    console.error(
      "Participant creation error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Failed to register participant.",
      },
      {
        status: 500,
      }
    );
  }
}


// ==========================================
// PATCH
// Complete quiz
// ==========================================

export async function PATCH(request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { success: false, message: "Cross-origin request denied." },
        { status: 403 }
      );
    }

    const participantId = getParticipantId(request);
    if (!participantId) {
      return NextResponse.json(
        { success: false, message: "Participant session required." },
        { status: 401 }
      );
    }

    const body = await request.json();
    if (!Array.isArray(body?.answers) || body.answers.length > 500) {
      return NextResponse.json(
        { success: false, message: "Invalid quiz answers." },
        { status: 400 }
      );
    }

    const submittedAnswers = new Map();
    for (const answer of body.answers) {
      if (
        !answer ||
        typeof answer.questionId !== "string" ||
        typeof answer.answer !== "string" ||
        submittedAnswers.has(answer.questionId)
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid quiz answers." },
          { status: 400 }
        );
      }

      submittedAnswers.set(answer.questionId, answer.answer);
    }

    await connectDB();
    const participant =
      await Participant.findOne({
        participantId,
      });

    if (!participant) {
      return NextResponse.json(
        {
          success: false,
          message: "Participant not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (participant.status === "completed") {
      return NextResponse.json(
        { success: false, message: "This quiz has already been submitted." },
        { status: 409 }
      );
    }

    const questions = await Question.find({})
      .select("answer")
      .lean();
    if (!questions.length) {
      return NextResponse.json(
        { success: false, message: "The quiz has no questions." },
        { status: 409 }
      );
    }

    const score = questions.reduce((total, question) => {
      return submittedAnswers.get(String(question._id)) === question.answer
        ? total + 1
        : total;
    }, 0);

    participant.status = "completed";
    participant.completedAt = new Date();
    participant.score = score;
    participant.totalQuestions = questions.length;

    await participant.save();

    const response = NextResponse.json({
      success: true,
      message: "Quiz completed successfully.",
      participant: {
        participantId:
          participant.participantId,
        status:
          participant.status,
        score:
          participant.score,
        totalQuestions:
          participant.totalQuestions,
        completedAt:
          participant.completedAt,
      },
    });

    response.cookies.set(PARTICIPANT_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error(
      "Quiz completion error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Failed to complete quiz.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(request) {
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

    await connectDB();
    const quizState = await QuizState.findOne({ key: QUIZ_STATE_KEY })
      .select("isStarted")
      .lean();

    if (quizState?.isStarted) {
      return NextResponse.json(
        { success: false, message: "End the quiz before clearing participant data." },
        { status: 409 }
      );
    }

    const result = await Participant.deleteMany({});

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Participant deletion error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to clear participant data." },
      { status: 500 }
    );
  }
}