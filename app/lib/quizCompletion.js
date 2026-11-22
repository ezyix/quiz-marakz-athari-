import Participant from "../models/Participant";
import { getQuizState, getQuizStateVersion } from "./quizState";
import { getAnswerKey } from "./questionCache";

const DEFAULT_DURATION_SECONDS = 60;

export function answersAsObject(answers) {
  if (!answers) {
    return {};
  }
  if (typeof answers.get === "function") {
    return Object.fromEntries(answers.entries());
  }
  if (typeof answers.toObject === "function") {
    return answers.toObject();
  }
  return { ...answers };
}

export async function reconcileParticipant(participantId) {
  if (!participantId) {
    return null;
  }

  const participant = await Participant.findOne({ participantId }).lean();
  if (!participant || participant.status !== "attending") {
    return participant;
  }

  const now = new Date();
  const quizState = await getQuizState();
  let effectiveExpiresAt = participant.expiresAt
    ? new Date(participant.expiresAt)
    : new Date(
        new Date(participant.startedAt).getTime() +
          (quizState?.durationSeconds ?? DEFAULT_DURATION_SECONDS) * 1000
      );

  if (!participant.expiresAt) {
    await Participant.updateOne(
      { participantId, expiresAt: null },
      { $set: { expiresAt: effectiveExpiresAt } }
    );
  }

  if (effectiveExpiresAt.getTime() > now.getTime()) {
    return participant;
  }

  const answerKey = await getAnswerKey(getQuizStateVersion(quizState));
  const savedAnswers = answersAsObject(participant.answers);
  let score = 0;

  for (const [questionId, correctAnswer] of answerKey.answers) {
    if (savedAnswers[questionId] === correctAnswer) {
      score += 1;
    }
  }

  const completed = await Participant.findOneAndUpdate(
    {
      participantId,
      status: "attending",
      expiresAt: { $lte: now },
    },
    {
      status: "completed",
      completedAt: now,
      score,
      totalQuestions: answerKey.total,
      late: true,
      completionReason: "timeout",
    },
    { returnDocument: "after" }
  ).lean();

  return completed || participant;
}

export async function expireParticipants() {
  const now = new Date();
  const expired = await Participant.find({
    status: "attending",
    expiresAt: { $lte: now },
  })
    .select("participantId")
    .lean();

  let completedCount = 0;
  for (const participant of expired) {
    const completed = await reconcileParticipant(participant.participantId);
    if (completed?.status === "completed") {
      completedCount += 1;
    }
  }

  return completedCount;
}

export async function saveParticipantAnswer(participantId, questionId, answer) {
  const reconciled = await reconcileParticipant(participantId);
  if (!reconciled) {
    return { participant: null, reason: "not-found" };
  }
  if (reconciled.status === "completed") {
    return { participant: reconciled, reason: "completed" };
  }

  const answerKey = await getAnswerKey(getQuizStateVersion(await getQuizState()));
  if (!answerKey.answers.has(questionId)) {
    return { participant: reconciled, reason: "invalid-question" };
  }

  const participant = await Participant.findOneAndUpdate(
    {
      participantId,
      status: "attending",
      expiresAt: { $gt: new Date() },
    },
    { $set: { [`answers.${questionId}`]: answer } },
    { returnDocument: "after" }
  ).lean();

  if (!participant) {
    return { participant: await reconcileParticipant(participantId), reason: "expired" };
  }

  return { participant, reason: null };
}

export async function completeParticipant(participantId, submittedAnswers) {
  const participant = await Participant.findOne({ participantId }).lean();
  if (!participant) {
    return { participant: null, reason: "not-found" };
  }
  if (participant.status === "completed") {
    return { participant, reason: "already-completed" };
  }

  const now = new Date();
  const quizState = await getQuizState();
  const durationSeconds =
    quizState?.durationSeconds ?? participant.durationSeconds ?? DEFAULT_DURATION_SECONDS;

  if (!participant.expiresAt) {
    const fallbackExpiresAt = new Date(
      new Date(participant.startedAt).getTime() + durationSeconds * 1000
    );
    await Participant.updateOne(
      { participantId, expiresAt: null },
      { $set: { expiresAt: fallbackExpiresAt } }
    );
    participant.expiresAt = fallbackExpiresAt;
  }

  if (new Date(participant.expiresAt || 0).getTime() <= now.getTime()) {
    const completed = await reconcileParticipant(participantId);
    return { participant: completed, reason: "completed" };
  }

  const answerKey = await getAnswerKey(getQuizStateVersion(quizState));
  const savedAnswers = answersAsObject(participant.answers);
  const finalAnswers = { ...savedAnswers, ...submittedAnswers };
  let score = 0;

  for (const [questionId, correctAnswer] of answerKey.answers) {
    if (finalAnswers[questionId] === correctAnswer) {
      score += 1;
    }
  }

  const completed = await Participant.findOneAndUpdate(
    {
      participantId,
      status: "attending",
      expiresAt: { $gt: now },
    },
    {
      status: "completed",
      completedAt: now,
      score,
      totalQuestions: answerKey.total,
      answers: finalAnswers,
      late: false,
      completionReason: "manual",
    },
    { returnDocument: "after" }
  ).lean();

  if (!completed) {
    return { participant: await reconcileParticipant(participantId), reason: "expired" };
  }

  return { participant: completed, reason: null };
}
