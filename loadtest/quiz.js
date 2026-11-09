// k6 load test for the quiz app. See loadtest/README.md before running.
//
// ONLY run this against a Vercel Preview deployment that uses a SEPARATE
// test database. It registers thousands of fake participants.
//
//   k6 run -e BASE_URL=https://<preview>.vercel.app \
//          -e I_UNDERSTAND_THIS_IS_PREVIEW=yes loadtest/quiz.js

import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/+$/, "");
const TARGET_VUS = Number(__ENV.TARGET_VUS || 5000);
const POLLER_SHARE = Number(__ENV.POLLER_SHARE || 0.3);
const RAMP_UP = __ENV.RAMP_UP || "2m";
const HOLD = __ENV.HOLD || "3m";
const RAMP_DOWN = __ENV.RAMP_DOWN || "30s";
const ANSWER_TIME_MIN_S = Number(__ENV.ANSWER_TIME_MIN_S || 10);
const ANSWER_TIME_MAX_S = Number(__ENV.ANSWER_TIME_MAX_S || 40);
const BYPASS_TOKEN = __ENV.VERCEL_BYPASS_TOKEN || "";

if (!BASE_URL) {
  throw new Error("Set BASE_URL to a Preview deployment URL.");
}

if (__ENV.I_UNDERSTAND_THIS_IS_PREVIEW !== "yes") {
  throw new Error(
    "Refusing to run. Only target a Preview deployment with a separate test " +
    "database, then pass -e I_UNDERSTAND_THIS_IS_PREVIEW=yes."
  );
}

const pollerVus = Math.max(1, Math.round(TARGET_VUS * POLLER_SHARE));
const participantVus = Math.max(1, TARGET_VUS - pollerVus);

function rampTo(target) {
  return [
    { duration: RAMP_UP, target },
    { duration: HOLD, target },
    { duration: RAMP_DOWN, target: 0 },
  ];
}

export const options = {
  scenarios: {
    // People sitting on the home page, polling quiz status.
    status_pollers: {
      executor: "ramping-vus",
      exec: "pollStatus",
      startVUs: 0,
      stages: rampTo(pollerVus),
      gracefulRampDown: "10s",
    },
    // Full journey: open home, register, load questions, submit.
    participants: {
      executor: "ramping-vus",
      exec: "takeQuiz",
      startVUs: 0,
      stages: rampTo(participantVus),
      gracefulRampDown: "60s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:quiz-status}": ["p(95)<500"],
    "http_req_duration{name:questions}": ["p(95)<1000"],
    "http_req_duration{name:register}": ["p(95)<1500"],
    "http_req_duration{name:submit}": ["p(95)<1500"],
    checks: ["rate>0.99"],
  },
};

function baseHeaders(extra = {}) {
  const headers = { ...extra };
  if (BYPASS_TOKEN) {
    headers["x-vercel-protection-bypass"] = BYPASS_TOKEN;
  }
  return headers;
}

function jsonHeaders() {
  // Origin must match the deployment for the same-origin checks.
  return baseHeaders({ "Content-Type": "application/json", Origin: BASE_URL });
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomDigits(length) {
  let digits = "";
  for (let index = 0; index < length; index += 1) {
    digits += Math.floor(Math.random() * 10);
  }
  return digits;
}

function getStatus() {
  const response = http.get(`${BASE_URL}/api/quiz-status`, {
    headers: baseHeaders(),
    tags: { name: "quiz-status" },
  });
  check(response, { "status 200": (r) => r.status === 200 });

  try {
    return response.json();
  } catch {
    return null;
  }
}

export function pollStatus() {
  getStatus();
  sleep(randomBetween(12, 18));
}

export function takeQuiz() {
  http.get(`${BASE_URL}/`, { headers: baseHeaders(), tags: { name: "home" } });

  const status = getStatus();
  if (!status?.isStarted) {
    // Quiz not started yet: behave like a waiting user.
    sleep(randomBetween(12, 18));
    return;
  }

  const vu = exec.vu.idInTest;
  const iteration = exec.vu.iterationInScenario;
  const registerResponse = http.post(
    `${BASE_URL}/api/participants`,
    JSON.stringify({
      fullName: `LOADTEST ${vu}-${iteration}-${randomDigits(4)}`,
      gender: Math.random() < 0.5 ? "Male" : "Female",
      age: Math.floor(randomBetween(8, 60)),
      whatsapp: `98765${randomDigits(5)}`,
      phoneCountry: "IN",
    }),
    { headers: jsonHeaders(), tags: { name: "register" } }
  );
  const registered = check(registerResponse, {
    "register 201": (r) => r.status === 201,
  });
  if (!registered) {
    sleep(1);
    return;
  }

  // The participant session cookie is kept in this VU's cookie jar.
  const questionsResponse = http.get(`${BASE_URL}/api/questions`, {
    headers: baseHeaders(),
    tags: { name: "questions" },
  });
  const questionsOk = check(questionsResponse, {
    "questions 200": (r) => r.status === 200,
    "no answers leaked": (r) => !r.body.includes('"answer"'),
  });
  if (!questionsOk) {
    return;
  }

  const questions = questionsResponse.json("questions") || [];
  sleep(randomBetween(ANSWER_TIME_MIN_S, ANSWER_TIME_MAX_S));

  const answers = questions.map((question) => ({
    questionId: question._id,
    answer: question.options[Math.floor(Math.random() * question.options.length)],
  }));

  const submitResponse = http.request(
    "PATCH",
    `${BASE_URL}/api/participants`,
    JSON.stringify({ answers }),
    { headers: jsonHeaders(), tags: { name: "submit" } }
  );
  check(submitResponse, { "submit 200": (r) => r.status === 200 });

  sleep(randomBetween(1, 3));
}
