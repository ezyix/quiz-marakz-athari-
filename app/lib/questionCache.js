import Question from "../models/Question";
import QuizState from "../models/QuizState";
import { cached, invalidate, invalidatePrefix } from "./cache";
import { QUIZ_STATE_KEY, invalidateQuizState } from "./quizState";

const QUESTIONS_TTL_MS = 30 * 1000;
const ADMIN_QUESTIONS_KEY = "questions:admin";
const STUDENT_QUESTIONS_PREFIX = "questions:student";

// Admin list includes answers. Student list never does.
// Student keys are versioned by the quiz state's updatedAt so every
// instance drops stale copies within the quiz-state TTL.
export function getQuestions({ isAdmin, version }) {
  if (isAdmin) {
    return cached(ADMIN_QUESTIONS_KEY, QUESTIONS_TTL_MS, () =>
      Question.find({}).sort({ createdAt: 1, _id: 1 }).lean()
    );
  }

  return cached(`${STUDENT_QUESTIONS_PREFIX}:${version}`, QUESTIONS_TTL_MS, () =>
    Question.find({})
      .select("-answer")
      .sort({ createdAt: 1, _id: 1 })
      .lean()
  );
}

const ANSWER_KEY_TTL_MS = 60 * 1000;
const ANSWER_KEY_PREFIX = "answer-key";

// Server-only answer key: { answers: Map(questionId -> answer), total }.
export function getAnswerKey(version) {
  return cached(`${ANSWER_KEY_PREFIX}:${version}`, ANSWER_KEY_TTL_MS, async () => {
    const questions = await Question.find({}).select("answer").lean();
    return {
      answers: new Map(
        questions.map((question) => [String(question._id), question.answer])
      ),
      total: questions.length,
    };
  });
}

// Call after any question add/delete.
export async function invalidateQuestionCaches() {
  invalidate(ADMIN_QUESTIONS_KEY);
  invalidatePrefix(STUDENT_QUESTIONS_PREFIX);
  invalidatePrefix(ANSWER_KEY_PREFIX);

  // Bump the version other instances see through the quiz-state cache.
  await QuizState.updateOne(
    { key: QUIZ_STATE_KEY },
    { updatedAt: new Date() },
    { upsert: true, setDefaultsOnInsert: true }
  );
  invalidateQuizState();
}
