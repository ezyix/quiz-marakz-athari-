"use client";

import "./globals.css";
import "./quiz/quiz.css";
import "./study-material.css";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";

const StudyPdfViewer = dynamic(() => import("./StudyPdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="study-pdf-loading" role="status">
      Loading study material…
    </div>
  ),
});

const studyMaterialDeadline = new Date("2026-11-29T10:00:00+05:30").getTime();

const primaryPhoneRegions = {
  "1": "US",
  "7": "RU",
  "39": "IT",
  "44": "GB",
  "47": "NO",
  "61": "AU",
  "212": "MA",
  "262": "RE",
  "358": "FI",
  "590": "GP",
  "599": "CW",
  "290": "SH",
};
const phoneCountriesByCallingCode = new Map();
for (const country of getCountries()) {
  const callingCode = getCountryCallingCode(country);
  if (
    !phoneCountriesByCallingCode.has(callingCode) ||
    primaryPhoneRegions[callingCode] === country
  ) {
    phoneCountriesByCallingCode.set(callingCode, country);
  }
}
const phoneCountries = [...phoneCountriesByCallingCode]
  .map(([callingCode, country]) => ({ country, callingCode }))
  .sort((first, second) => Number(first.callingCode) - Number(second.callingCode));

export default function LoadingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [gender, setGender] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("IN");
  const [formData, setFormData] = useState({
    fullName: "",
    age: "",
    whatsapp: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [quizStarted, setQuizStarted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [captureGuardActive, setCaptureGuardActive] = useState(false);
  const [studyToastMessage, setStudyToastMessage] = useState("");
  const [studyToastVisible, setStudyToastVisible] = useState(false);
  const [studyToastId, setStudyToastId] = useState(0);

  const showStudyToast = (message) => {
    setStudyToastMessage(message);
    setStudyToastId((id) => id + 1);
  };

  const refreshQuizStatus = async () => {
    try {
      const response = await fetch("/api/quiz-status", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load quiz status.");
      }

      setQuizStarted(Boolean(data.isStarted));
    } catch (loadError) {
      console.error("Quiz status load failed:", loadError);
    }
  };

  // Loading screen
  useEffect(() => {
    const loadingStartedAt = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - loadingStartedAt;
      setLoadingProgress(Math.min(100, Math.floor((elapsed / 5000) * 100)));
    }, 50);

    const timer = setTimeout(async () => {
      setLoadingProgress(100);
      await refreshQuizStatus();
      setLoading(false);
    }, 5000);

    const poller = setInterval(() => {
      refreshQuizStatus();
    }, 10000);

    return () => {
      clearTimeout(timer);
      clearInterval(poller);
      clearInterval(progressInterval);
    };
  }, []);

  useEffect(() => {
    let interval;

    const updateCountdown = () => {
      const seconds = Math.max(
        0,
        Math.ceil((studyMaterialDeadline - Date.now()) / 1000)
      );
      setRemainingSeconds(seconds);

      if (seconds === 0) {
        clearInterval(interval);
      }
    };

    interval = setInterval(updateCountdown, 1000);
    updateCountdown();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loading || quizStarted) {
      return;
    }

    let captureTimeout;

    const handleStudyKeyDown = (event) => {
      const key = event.key.toLowerCase();

      if (event.key === "PrintScreen") {
        setCaptureGuardActive(true);
        clearTimeout(captureTimeout);
        captureTimeout = setTimeout(() => setCaptureGuardActive(false), 1500);
      }

      if ((event.ctrlKey || event.metaKey) && ["s", "p", "u"].includes(key)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleStudyKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleStudyKeyDown, true);
      clearTimeout(captureTimeout);
    };
  }, [loading, quizStarted]);

  useEffect(() => {
    if (studyToastId === 0) {
      return;
    }

    setStudyToastVisible(true);
    const hideTimeout = setTimeout(() => {
      setStudyToastVisible(false);
    }, 3000);
    const clearTimeoutId = setTimeout(() => {
      setStudyToastMessage("");
    }, 3300);

    return () => {
      clearTimeout(hideTimeout);
      clearTimeout(clearTimeoutId);
    };
  }, [studyToastId]);

  const handleShareStudyPdf = async () => {
    if (typeof navigator.share !== "function") {
      showStudyToast("PDF sharing is not supported by this browser.");
      return;
    }

    try {
      const response = await fetch("/Fathiha.pdf");
      if (!response.ok) {
        throw new Error(`PDF request failed with status ${response.status}.`);
      }

      const pdfBlob = await response.blob();
      const pdfFile = new File([pdfBlob], "Fathiha.pdf", {
        type: "application/pdf",
      });

      if (
        typeof navigator.canShare !== "function" ||
        !navigator.canShare({ files: [pdfFile] })
      ) {
        showStudyToast("Sharing PDF files is not supported by this browser.");
        return;
      }

      await navigator.share({
        files: [pdfFile],
        title: "Fathiha study material",
      });
      showStudyToast("PDF sharing....");
    } catch (shareError) {
      if (shareError.name === "AbortError") {
        return;
      }

      console.error("Study PDF sharing failed:", shareError);
      showStudyToast("Unable to share the PDF. Please try downloading it.");
    }
  };

  // Handle input changes
  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: name === "fullName" ? value.toUpperCase() : value,
    }));
  };

  // Start quiz
  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    // Basic validation
    if (!formData.fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!gender) {
      setError("Please select your gender.");
      return;
    }

    if (!formData.age) {
      setError("Please enter your age.");
      return;
    }

    if (
      Number(formData.age) < 1 ||
      Number(formData.age) > 120
    ) {
      setError("Please enter a valid age.");
      return;
    }

    if (!formData.whatsapp.trim()) {
      setError("Please enter your WhatsApp number.");
      return;
    }

    const parsedPhone = parsePhoneNumberFromString(
      formData.whatsapp,
      phoneCountry
    );
    if (!parsedPhone?.isValid()) {
      const selectedCountry = phoneCountries.find(
        ({ country }) => country === phoneCountry
      );
      setError(
        `Please enter a valid WhatsApp number for calling code +${selectedCountry?.callingCode || ""}.`
      );
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch("/api/participants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          gender,
          age: Number(formData.age),
          whatsapp: formData.whatsapp.trim(),
          phoneCountry,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
      }

      // Save participant information locally
      localStorage.setItem(
        "quizParticipant",
        JSON.stringify(data.participant)
      );

      // Go to quiz page
      router.push(`/quiz?participantId=${data.participant.participantId}`);
    } catch (error) {
      console.error(error);
      setError(error.message || "Unable to start the quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------
  // Loading screen
  // -------------------------

  if (loading) {
    return (
      <main className="quiz-loading loading-page">
        <div className="loading-content">
          <div className="logo-wrapper">
            <Image
              src="/logo.png"
              alt="Al Markazul Athari"
              width={120}
              height={130}
              priority
            />
          </div>


          <div
            className="loading-progress"
            role="progressbar"
            aria-label="Loading quiz"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={loadingProgress}
          >
            <div className="loading-progress-fill" style={{ width: `${loadingProgress}%` }} />
          </div>
          <br/>
          <p className="loading-status" role="status">
            loading....
          </p>
        </div>
      </main>
    );
  }

  if (!quizStarted) {
    return (
      <main
        className="study-page"
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
      >
        <header className="study-header">
          <div className="study-brand">
            <Image src="/logo.png" alt="Al Markazul Athari" width={48} height={55} />
            <Image src="/brand name.png" alt="Al Markazul Athari" width={150} height={46} />
          </div>
        </header>

        <section className="study-card" aria-labelledby="study-title">
          {studyToastMessage && (
            <div
              className={`study-download-toast${studyToastVisible ? " is-visible" : ""}`}
              role="status"
              aria-live="polite"
            >
              {studyToastMessage}
            </div>
          )}
          <p className="study-eyebrow">STUDY MATERIAL</p>
          <h1 id="study-title">Prepare for the quiz</h1>
          <p className="study-intro">
            Review the material below before the quiz begins.
          </p>

          <div className="study-countdown" aria-live="polite">
            <p className="study-countdown-label">Time remaining</p>
            {remainingSeconds === null ? (
              <p className="study-countdown-value">Loading timer…</p>
            ) : remainingSeconds === 0 ? (
              <p className="study-countdown-value">Study period has ended</p>
            ) : (
              <div className="study-countdown-units">
                {[
                  ["Days", Math.floor(remainingSeconds / 86400)],
                  ["Hours", Math.floor((remainingSeconds % 86400) / 3600)],
                  ["Minutes", Math.floor((remainingSeconds % 3600) / 60)],
                  ["Seconds", remainingSeconds % 60],
                ].map(([label, value]) => (
                  <div className="study-countdown-unit" key={label}>
                    <span>{String(value).padStart(2, "0")}</span>
                    <small>{label}</small>
                  </div>
                ))}
              </div>
            )}
            <p className="study-deadline">
              Ends 29 November 2026 at 10:00 AM
            </p>
          </div>

          {remainingSeconds === 0 ? (
            <div className="study-expired" role="status">
              The study-material period has ended.
            </div>
          ) : (
            <div className="study-viewer-shell">
              {captureGuardActive && (
                <div className="study-capture-guard" role="status">
                  Study material hidden
                </div>
              )}
              <StudyPdfViewer />
              <div className="study-watermark" aria-hidden="true">
                AL-MARKAZUL-ATHARI · STUDY MATERIAL
              </div>
            </div>
          )}
          {remainingSeconds !== 0 && (
            <div className="study-download-section">
              <a
                className="study-download-button"
                href="/Fathiha.pdf"
                download="Fathiha.pdf"
                onClick={() => showStudyToast("PDF downloading...")}
              >
                <svg
                  className="study-action-icon"
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 17v3h14v-3" />
                </svg>
                Download PDF
              </a>
              <button
                className="study-download-button study-share-button"
                type="button"
                onClick={handleShareStudyPdf}
              >
                <svg
                  className="study-action-icon"
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4" />
                </svg>
                Share PDF
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  // -------------------------
  // Welcome page
  // -------------------------

  return (
    <main className="quiz-page welcome-page">
                <div style={{ marginBottom: "20px" }}>
        <Image src="/logo.png" alt="logo" width="43" height="50" style={{ marginRight: "5px" }} /><Image src="/brand name.png" alt="Al Markazul Athari" width="130" height="40" />
                </div>   


      <section
        className="question-card welcome-card"
        aria-labelledby="welcome-title"
      >
        <p className="question-number">WELCOME</p>

        <h2 id="welcome-title">
          Let&apos;s get you started.
        </h2>

        <p className="question-text">
          Enter your details below. to participate in the quiz. Please ensure that the information you provide is <br/>accurate, as it will be used for identification and communication purposes.
        </p>

        <form
          className="quiz-form"
          onSubmit={handleSubmit}
        >
          {/* Full Name */}

          <label htmlFor="full-name">
            Full name
          </label>

          <input
            id="full-name"
            name="fullName"
            type="text"
            placeholder="e.g. Aisha Rahman"
            value={formData.fullName}
            onChange={handleChange}
            autoComplete="name"
            required
          />

          {/* Gender */}

          <fieldset>
            <legend>Gender</legend>

            <div className="gender-options">
              <button
                type="button"
                className={
                  gender === "Male"
                    ? "gender-option selected"
                    : "gender-option"
                }
                onClick={() => setGender("Male")}
              >
                Male
              </button>

              <button
                type="button"
                className={
                  gender === "Female"
                    ? "gender-option selected"
                    : "gender-option"
                }
                onClick={() => setGender("Female")}
              >
                Female
              </button>
            </div>
          </fieldset>

          {/* Age */}

          <label htmlFor="age">
            Age
          </label>

          <input
            id="age"
            name="age"
            type="number"
            min="1"
            max="120"
            placeholder="e.g. 21"
            value={formData.age}
            onChange={handleChange}
            required
          />

          {/* WhatsApp */}

          <label htmlFor="whatsapp">
            WhatsApp number
          </label>

          <div className="phone-number-row">
            <select
              aria-label="Country calling code"
              autoComplete="off"
              value={phoneCountry}
              onChange={(event) => setPhoneCountry(event.target.value)}
            >
              {phoneCountries.map(({ country, callingCode }) => (
                <option key={country} value={country}>+{callingCode}</option>
              ))}
            </select>
            <input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              placeholder="98765 43210"
              value={formData.whatsapp}
              onChange={handleChange}
              autoComplete="tel-national"
              aria-label="WhatsApp number"
              required
            />
          </div>

          {/* Error */}

          {error && (
            <p className="quiz-error form-error">
              {error}
            </p>
          )}

          {/* Start */}

          <button
            className="next-button start-button"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Starting..."
              : "Start the Quiz"}
          </button>
        </form>
      </section>
    </main>
  );
}