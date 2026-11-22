import { NextResponse } from "next/server";
import connectDB from "../../lib/mongodb";
import { expireParticipants } from "../../lib/quizCompletion";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authorized =
      request.headers.get("authorization") === `Bearer ${cronSecret}` ||
      request.headers.get("x-vercel-cron-secret") === cronSecret;
    if (!authorized) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
  }

  await connectDB();
  const completedCount = await expireParticipants();

  return NextResponse.json({
    success: true,
    completedCount,
  });
}
