import QuizState from "../models/QuizState";
import { cached, invalidate } from "./cache";

export const QUIZ_STATE_KEY = "global";
const QUIZ_STATE_CACHE_KEY = "quiz-state";
const QUIZ_STATE_TTL_MS = 3000;

// Cached read of the global quiz state for hot read paths.
// Write-path guards should keep querying the DB directly.
export function getQuizState() {
  return cached(QUIZ_STATE_CACHE_KEY, QUIZ_STATE_TTL_MS, () =>
    QuizState.findOne({ key: QUIZ_STATE_KEY }).lean()
  );
}

export function invalidateQuizState() {
  invalidate(QUIZ_STATE_CACHE_KEY);
}

// Version string that changes whenever the quiz state document is updated.
// Used to version per-instance caches of question data.
export function getQuizStateVersion(state) {
  return state?.updatedAt ? new Date(state.updatedAt).getTime() : 0;
}
