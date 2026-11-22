"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";
import Image from "next/image";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import "../globals.css";

const DEFAULT_QUIZ_TIME = 60;

function getShuffleSeed(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = seed;

  return () => {
    state += 0x6D2B79F5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleQuestions(questions, participantId) {
  if (!participantId || questions.length < 2) {
    return questions;
  }

  const shuffled = [...questions];
  const random = createSeededRandom(getShuffleSeed(participantId));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <main className="quiz-loading">
          <div className="quiz-loader" />
          <p>Loading quiz...</p>
        </main>
      }
    >
      <QuizPageContent />
    </Suspense>
  );
}

function QuizPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const participantId = searchParams.get("participantId");

  const [participant, setParticipant] = useState(null);

  const [questions, setQuestions] = useState([]);

  const [questionsLoading, setQuestionsLoading] = useState(true);

  const [currentQuestion, setCurrentQuestion] = useState(0);

  const [selectedAnswer, setSelectedAnswer] = useState("");

  const [answers, setAnswers] = useState({});

  const [score, setScore] = useState(0);

  const [timeLeft, setTimeLeft] = useState(DEFAULT_QUIZ_TIME);

  const [timerSettingsLoaded, setTimerSettingsLoaded] = useState(false);

  const [timerExpiresAt, setTimerExpiresAt] = useState(null);

  const [serverAnswers, setServerAnswers] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const [completed, setCompleted] = useState(false);

  const [error, setError] = useState("");

  const [showQuitConfirmation, setShowQuitConfirmation] = useState(false);

  // ==========================================
  // Load participant
  // ==========================================

  useEffect(() => {
    if (!participantId) {
      router.replace("/");
      return;
    }

    const savedParticipant =
      localStorage.getItem("quizParticipant");

    if (!savedParticipant) {
      router.replace("/");
      return;
    }

    try {
      const parsed =
        JSON.parse(savedParticipant);

      if (
        parsed.participantId !== participantId ||
        parsed.status === "completed"
      ) {
        router.replace("/");
        return;
      }

      setParticipant(parsed);
    } catch (error) {
      console.error(
        "Invalid participant data",
        error
      );
      router.replace("/");
    }
  }, [participantId, router]);

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const response = await fetch("/api/questions", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load quiz questions.");
        }

        setQuestions(shuffleQuestions(data.questions || [], participantId));
      } catch (loadError) {
        setError(loadError.message || "Unable to load quiz questions.");
      } finally {
        setQuestionsLoading(false);
      }
    };

    loadQuestions();
  }, [participantId]);

  useEffect(() => {
    const loadQuizTimer = async () => {
      try {
        const response = await fetch("/api/participants", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load quiz timer.");
        }

        const participantStatus = data.participant;
        if (participantStatus?.status === "completed") {
          setScore(participantStatus.score);
          setCompleted(true);
          return;
        }

        setServerAnswers(participantStatus?.answers || {});

        const expiresAt = new Date(participantStatus?.expiresAt);
        if (!Number.isNaN(expiresAt.getTime())) {
          setTimerExpiresAt(expiresAt);
          setTimeLeft(
            Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))
          );
        } else {
          setTimeLeft(
            typeof data.durationSeconds === "number"
              ? data.durationSeconds
              : DEFAULT_QUIZ_TIME
          );
        }
      } catch (loadError) {
        console.error("Unable to load quiz timer:", loadError);
        setTimeLeft(DEFAULT_QUIZ_TIME);
      } finally {
        setTimerSettingsLoaded(true);
      }
    };

    loadQuizTimer();
  }, []);

  // ==========================================
  // Prevent leaving the quiz before completion
  // ==========================================

  useEffect(() => {
    if (!participant || completed || submitting) {
      return;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue =
        "would you like to quit the quiz";
      return event.returnValue;
    };

    const handlePopState = () => {
      window.history.pushState(
        null,
        "",
        window.location.href
      );
      setShowQuitConfirmation(true);
    };

    window.history.pushState(
      null,
      "",
      window.location.href
    );

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );
    window.addEventListener(
      "popstate",
      handlePopState
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
      window.removeEventListener(
        "popstate",
        handlePopState
      );
    };
  }, [participant, completed, submitting, router]);

  useEffect(() => {
    if (!completed) {
      return;
    }

    const handleCompletedQuizBack = () => {
      router.replace("/");
    };

    window.addEventListener(
      "popstate",
      handleCompletedQuizBack
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handleCompletedQuizBack
      );
    };
  }, [completed, router]);

  // ==========================================
  // Countdown timer
  // ==========================================

  useEffect(() => {
    if (!timerSettingsLoaded || questionsLoading || !questions.length || completed || submitting) {
      return;
    }

    const timer = setInterval(() => {
      if (!timerExpiresAt) {
        setTimeLeft((previous) => Math.max(0, previous - 1));
        return;
      }

      const remaining = Math.max(
        0,
        Math.ceil((timerExpiresAt.getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        finishQuiz();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [timerExpiresAt, completed, submitting, questionsLoading, questions, timerSettingsLoaded]);

  // ==========================================
  // Restore selected answer
  // ==========================================

  useEffect(() => {
    const savedAnswer =
      answers[currentQuestion];

    setSelectedAnswer(savedAnswer || "");
  }, [currentQuestion, answers]);

  useEffect(() => {
    if (!serverAnswers || !questions.length) {
      return;
    }

    const restoredAnswers = {};
    questions.forEach((question, index) => {
      if (typeof serverAnswers[question._id] === "string") {
        restoredAnswers[index] = serverAnswers[question._id];
      }
    });
    setAnswers(restoredAnswers);
  }, [serverAnswers, questions]);

  // ==========================================
  // Select answer
  // ==========================================

  const handleAnswer = (answer) => {
    setSelectedAnswer(answer);

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion]: answer,
    }));

    const question = questions[currentQuestion];
    if (!question?._id) {
      return;
    }

    fetch("/api/participants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "saveAnswer",
        questionId: question._id,
        answer,
      }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok && data.participant?.status === "completed") {
          setScore(data.participant.score);
          setCompleted(true);
        } else if (!response.ok) {
          console.error("Answer save failed:", data.message);
        }
      })
      .catch((saveError) => {
        console.error("Answer save failed:", saveError);
      });
  };

  // ==========================================
  // Next question
  // ==========================================

  const handleNext = () => {
    if (!selectedAnswer) {
      setError("Please select an answer.");
      return;
    }

    setError("");

    if (
      currentQuestion <
      questions.length - 1
    ) {
      setCurrentQuestion(
        (previous) => previous + 1
      );
    } else {
      finishQuiz();
    }
  };

  // ==========================================
  // Finish quiz
  // ==========================================

  const finishQuiz = async () => {
    if (submitting || completed) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const finalAnswers = {
        ...answers,
        [currentQuestion]: selectedAnswer,
      };

      const response = await fetch(
        "/api/participants",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            answers: questions.flatMap((question, index) =>
              typeof finalAnswers[index] === "string"
                ? [{ questionId: question._id, answer: finalAnswers[index] }]
                : []
            ),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to submit quiz."
        );
      }

      setScore(data.participant.score);

      // Update local storage
      const savedParticipant =
        localStorage.getItem(
          "quizParticipant"
        );

      if (savedParticipant) {
        const updatedParticipant =
          JSON.parse(savedParticipant);

        updatedParticipant.status =
          "completed";

        updatedParticipant.status = "completed";

        localStorage.setItem(
          "quizParticipant",
          JSON.stringify(
            updatedParticipant
          )
        );
      }

      setCompleted(true);
    } catch (error) {
      console.error(error);

      setError(
        error.message ||
          "Unable to submit your quiz."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // Format time
  // ==========================================

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);

    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  // ==========================================
  // Loading
  // ==========================================

  if (!participant && !completed) {
    return (
      <main className="quiz-loading">
        <div className="quiz-loader" />
        <p>Loading quiz...</p>
      </main>
    );
  }

  // ==========================================
  // Completed
  // ==========================================

  if (completed) {
    const percentage = Math.round(
          (score / questions.length) *
        100
    );

    return (
      <main className="quiz-completed">
        <div className="result-card">

          <div className="success-icon">
            ✓
          </div>

          <p className="result-eyebrow">
            QUIZ COMPLETED
          </p>

          <h1>
            {participant?.fullName
              ? ` ${participant.fullName}`
              : ""}
            
          </h1>

          <p className="result-description">
            Your quiz has been successfully
            submitted.
          </p>

          <div className="score-box" aria-label={`Your score: ${score} out of ${questions.length}, ${percentage}%`}>
            <span>Your Score</span>
            <strong>
              {score}<small> / {questions.length}</small>
            </strong>
            <p>{percentage}%</p>
          </div>

          <p className="result-message">
            Thank you for participating.
          </p>

        </div>
      </main>
    );
  }

  if (questionsLoading) {
    return (
      <main className="quiz-loading">
        <div className="quiz-loader" />
        <p>Loading quiz...</p>
      </main>
    );
  }

  if (!questions.length) {
    return (
      <main className="quiz-loading">
        <p>{error || "The quiz is not available yet. Please contact the admin."}</p>
      </main>
    );
  }

  const question =
    questions[currentQuestion];

  const progress =
    ((currentQuestion + 1) /
      questions.length) *
    100;

  return (
    <main className="quiz-page">

      {/* ================================= */}
      {/* Header */}
      {/* ================================= */}

      <header className="quiz-header">

        <div className="quiz-brand">
                <div>
        <Image src="/logo.png" alt="logo" width="35" height="40" style={{ marginRight: "5px" }} /><Image src="/brand name.png" alt="Al Markazul Athari" width="100" height="30" />
                </div>


        </div>

        <div className="timer">
          <span>Time Left</span>

          <strong>
            {formatTime(timeLeft)}
          </strong>
        </div>

      </header>

      {/* ================================= */}
      {/* Progress */}
      {/* ================================= */}

      <div className="progress-container">

        <div className="progress-info">
          <span>
            Question{" "}
            {currentQuestion + 1} of{" "}
            {questions.length}
          </span>

          <span>
            {Math.round(progress)}%
          </span>
        </div>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

      </div>

      {/* ================================= */}
      {/* Question */}
      {/* ================================= */}

      <section className="question-card">

        <div className="question-number">
          QUESTION {currentQuestion + 1}
        </div>

        <h2>
          {question.question}
        </h2>

        <div className="options">

          {question.options.map(
            (option, index) => {

              const optionLetter =
                String.fromCharCode(
                  65 + index
                );

              const isSelected =
                selectedAnswer ===
                option;

              return (
                <button
                  key={option}
                  type="button"
                  className={
                    isSelected
                      ? "answer-option selected"
                      : "answer-option"
                  }
                  onClick={() =>
                    handleAnswer(
                      option
                    )
                  }
                >

                  <span className="option-letter">
                    {optionLetter}
                  </span>

                  <span className="option-text">
                    {option}
                  </span>

                  <span className="option-check">
                    {isSelected
                      ? "✓"
                      : ""}
                  </span>

                </button>
              );
            }
          )}

        </div>

        {error && (
          <p className="quiz-error">
            {error}
          </p>
        )}

        {/* ================================= */}
        {/* Navigation */}
        {/* ================================= */}

        <div className="quiz-navigation">
          <button
            type="button"
            className="next-button"
            onClick={handleNext}
            disabled={
              submitting ||
              !selectedAnswer
            }
          >
            {currentQuestion ===
            questions.length - 1
              ? submitting
                ? "Submitting..."
                : "Finish Quiz"
              : "Next Question →"}
          </button>

        </div>

      </section>

      {showQuitConfirmation && (
        <div className="quiz-confirm-modal-backdrop">
          <section
            className="quiz-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quit-quiz-title"
            aria-describedby="quit-quiz-description"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setShowQuitConfirmation(false);
              }
            }}
          >
            <h2 id="quit-quiz-title">Quit the quiz?</h2>
            <p id="quit-quiz-description">Would you like to quit the quiz?</p>
            <div className="quiz-confirm-modal-actions">
              <button
                className="previous-button"
                type="button"
                autoFocus
                onClick={() => setShowQuitConfirmation(false)}
              >
                Cancel
              </button>
              <button
                className="next-button"
                type="button"
                onClick={() => {
                  localStorage.removeItem("quizParticipant");
                  router.replace("/");
                }}
              >
                OK
              </button>
            </div>
          </section>
        </div>
      )}

    </main>
  );
}