import { NextResponse } from "next/server";
import connectDB from "../../lib/mongodb";
import Participant from "../../models/Participant";


// ==========================================
// GET
// List participants and dashboard summary
// ==========================================

export async function GET() {
  try {
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
    });
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
    await connectDB();

    const body = await request.json();

    const {
      fullName,
      gender,
      age,
      whatsapp,
    } = body;

    // Validation

    if (
      !fullName ||
      !gender ||
      !age ||
      !whatsapp
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

    // Generate unique participant ID

    const participantId =
      `P-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;

    // Create participant

    const participant =
      await Participant.create({
        participantId,
        fullName: fullName.trim(),
        gender,
        age: Number(age),
        whatsapp: whatsapp.trim(),
        status: "attending",
        startedAt: new Date(),
      });

    return NextResponse.json(
      {
        success: true,
        message: "Participant registered successfully.",
        participant: {
          participantId:
            participant.participantId,
          fullName:
            participant.fullName,
          gender:
            participant.gender,
          age:
            participant.age,
          whatsapp:
            participant.whatsapp,
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
  } catch (error) {
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
    await connectDB();

    const body = await request.json();

    const {
      participantId,
      score,
      totalQuestions,
    } = body;

    if (!participantId) {
      return NextResponse.json(
        {
          success: false,
          message: "Participant ID is required.",
        },
        {
          status: 400,
        }
      );
    }

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

    participant.status = "completed";
    participant.completedAt = new Date();

    if (score !== undefined) {
      participant.score = Number(score);
    }

    if (totalQuestions !== undefined) {
      participant.totalQuestions =
        Number(totalQuestions);
    }

    await participant.save();

    return NextResponse.json({
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