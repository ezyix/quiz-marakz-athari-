import { NextResponse } from "next/server";
import connectDB from "../../lib/mongodb";
import Participant from "../../models/Participant";
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
import {
  QUIZ_STATE_KEY,
  getQuizState,
  getQuizStateVersion,
} from "../../lib/quizState";
import { getAnswerKey } from "../../lib/questionCache";

const DEFAULT_DURATION_SECONDS = 60;
const SUBMIT_GRACE_SECONDS = 30;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

// Same group rules as the admin leaderboard tabs.
const GROUP_FILTERS = {
  all: {},
  male: { gender: "Male", age: { $gte: 13 } },
  female: { gender: "Female", age: { $gte: 13 } },
  kidsMale: { gender: "Male", age: { $lt: 13 } },
  kidsFemale: { gender: "Female", age: { $lt: 13 } },
};

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

const isCompleted = { $eq: ["$status", "completed"] };
const hasValidDuration = {
  $and: [
    isCompleted,
    { $eq: [{ $type: "$startedAt" }, "date"] },
    { $eq: [{ $type: "$completedAt" }, "date"] },
    { $gte: ["$completedAt", "$startedAt"] },
  ],
};
const completionDuration = { $subtract: ["$completedAt", "$startedAt"] };

async function getParticipantSummary() {
  const isAdult = { $gte: ["$age", 13] };
  const isKid = { $lt: ["$age", 13] };
  const isMale = { $eq: ["$gender", "Male"] };
  const isFemale = { $eq: ["$gender", "Female"] };
  const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

  const [summary] = await Participant.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        male: countIf({ $and: [isMale, isAdult] }),
        female: countIf({ $and: [isFemale, isAdult] }),
        kids: countIf(isKid),
        kidsMale: countIf({ $and: [isKid, isMale] }),
        kidsFemale: countIf({ $and: [isKid, isFemale] }),
        inProgress: countIf({ $eq: ["$status", "attending"] }),
        completed: countIf(isCompleted),
        // $min ignores nulls.
        fastestFinish: {
          $min: { $cond: [hasValidDuration, completionDuration, null] },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return {
    total: summary?.total ?? 0,
    male: summary?.male ?? 0,
    female: summary?.female ?? 0,
    kids: summary?.kids ?? 0,
    kidsMale: summary?.kidsMale ?? 0,
    kidsFemale: summary?.kidsFemale ?? 0,
    inProgress: summary?.inProgress ?? 0,
    completed: summary?.completed ?? 0,
    fastestFinish: summary?.fastestFinish ?? null,
  };
}

// Leaderboard order: completed first, then highest score rate, then fastest
// finish; in-progress participants stay newest first.
async function getLeaderboardPage(match, requestedPage, limit) {
  const total = await Participant.countDocuments(match);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);

  const participants = await Participant.aggregate([
    { $match: match },
    {
      $addFields: {
        _rankCompleted: { $cond: [isCompleted, 0, 1] },
        _rankScoreRate: {
          $cond: [
            { $and: [isCompleted, { $gt: ["$totalQuestions", 0] }] },
            { $divide: ["$score", "$totalQuestions"] },
            0,
          ],
        },
        _rankDuration: {
          $cond: [hasValidDuration, completionDuration, Number.MAX_SAFE_INTEGER],
        },
      },
    },
    {
      $sort: {
        _rankCompleted: 1,
        _rankScoreRate: -1,
        _rankDuration: 1,
        createdAt: -1,
        _id: -1,
      },
    },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $project: { _rankCompleted: 0, _rankScoreRate: 0, _rankDuration: 0 } },
  ]);

  return { participants, total, page, totalPages };
}

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

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "1";
    const requestedGroup = searchParams.get("group") || "all";
    const group = Object.prototype.hasOwnProperty.call(GROUP_FILTERS, requestedGroup)
      ? requestedGroup
      : "all";
    const limit = clampInteger(searchParams.get("limit"), DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
    const requestedPage = clampInteger(searchParams.get("page"), 1, 1, Number.MAX_SAFE_INTEGER);

    const summaryPromise = getParticipantSummary();

    if (all) {
      // Full export (PDF): newest first, same shape as before.
      const [participants, summary] = await Promise.all([
        Participant.find({}).sort({ createdAt: -1 }).lean(),
        summaryPromise,
      ]);

      return NextResponse.json({
        success: true,
        participants,
        summary,
        pagination: {
          page: 1,
          limit: participants.length,
          total: participants.length,
          totalPages: 1,
          group: "all",
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const [leaderboard, summary] = await Promise.all([
      getLeaderboardPage(GROUP_FILTERS[group], requestedPage, limit),
      summaryPromise,
    ]);

    return NextResponse.json({
      success: true,
      participants: leaderboard.participants,
      summary,
      pagination: {
        page: leaderboard.page,
        limit,
        total: leaderboard.total,
        totalPages: leaderboard.totalPages,
        group,
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

    const quizState = await getQuizState();
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
    const quizState = await getQuizState();
    const answerKey = await getAnswerKey(getQuizStateVersion(quizState));
    if (!answerKey.total) {
      return NextResponse.json(
        { success: false, message: "The quiz has no questions." },
        { status: 409 }
      );
    }

    let score = 0;
    for (const [questionId, correctAnswer] of answerKey.answers) {
      if (submittedAnswers.get(questionId) === correctAnswer) {
        score += 1;
      }
    }

    const completedAt = new Date();
    const durationSeconds = quizState?.durationSeconds ?? DEFAULT_DURATION_SECONDS;
    const onTimeSince = new Date(
      completedAt.getTime() - (durationSeconds + SUBMIT_GRACE_SECONDS) * 1000
    );
    const completion = {
      status: "completed",
      completedAt,
      score,
      totalQuestions: answerKey.total,
    };
    const updateOptions = { returnDocument: "after" };

    // Atomic: only an "attending" participant can be completed, once.
    // Common case (on time) is a single query.
    let participant = await Participant.findOneAndUpdate(
      {
        participantId,
        status: "attending",
        $or: [
          { startedAt: { $gte: onTimeSince } },
          { startedAt: null },
        ],
      },
      { ...completion, late: false },
      updateOptions
    ).lean();

    if (!participant) {
      // Past the time limit + grace: still record answers, but flag as late.
      participant = await Participant.findOneAndUpdate(
        { participantId, status: "attending" },
        { ...completion, late: true },
        updateOptions
      ).lean();
    }

    if (!participant) {
      return NextResponse.json(
        { success: false, message: "This quiz has already been submitted or the participant was not found." },
        { status: 409 }
      );
    }

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
        late:
          participant.late,
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