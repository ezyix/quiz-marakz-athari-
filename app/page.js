"use client";

import "./globals.css";
import "./quiz/quiz.css";
import "./study-material.css";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import StudyPdfViewer from "./StudyPdfViewer";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";

const STATUS_POLL_BASE_MS = 15000;
const STATUS_POLL_JITTER_MS = 3000;

const studyMaterialDeadline =new Date("2026-11-29T10:00:00+05:30").getTime();

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

    // Poll every 15s ± 3s (jitter spreads load); pause while the tab is hidden.
    let pollTimeout;
    let pollingStopped = false;
    const schedulePoll = () => {
      clearTimeout(pollTimeout);
      if (pollingStopped) {
        return;
      }
      const delay =
        STATUS_POLL_BASE_MS + (Math.random() * 2 - 1) * STATUS_POLL_JITTER_MS;
      pollTimeout = setTimeout(async () => {
        if (!document.hidden) {
          await refreshQuizStatus();
        }
        schedulePoll();
      }, delay);
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshQuizStatus();
        schedulePoll();
      }
    };

    schedulePoll();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      pollingStopped = true;
      clearTimeout(timer);
      clearTimeout(pollTimeout);
      clearInterval(progressInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
          <p className="study-eyebrow"style={{ textAlign: "right", width: "100%" }}>​ الدروس المهمة لعامة الأمة</p>
          <h1 id="study-title" dir="rtl" lang="ar" style={{ textAlign: "right", width: "100%" }}>
  <p className="study-intro">
            പൊതുജനങ്ങൾക്ക് വേണ്ടിയുള്ള സുപ്രധാന പാഠങ്ങൾ
          </p>
</h1>

          <p className="study-intro">
         21/11/26 ന് നടന്ന ദർസ് അടിസ്ഥാനമാക്കിയുള്ള ക്വിസ് മത്സരം 
          </p>

          <div className="study-countdown" aria-live="polite">
            <p className="study-countdown-label">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="19" />
                <path d="M24 13v12l9 5" />
              </svg>
              <span>Time </span>
            </p>

            <p className="study-deadline">
              <span className="study-deadline-rule" aria-hidden="true" />
              
              <span> INDIA 07:45 PM  ---- 10:45 PM</span>
                <span> SAUDI 05:15 PM  ---- 8:15 PM</span>
              <span className="study-deadline-rule" aria-hidden="true" />
            </p>
            
          </div>
  <p className="study-intro">
            പ്രത്യേക ശ്രദ്ധയ്ക്ക് :
          </p>
            <p className="study-intro">
* ഒരാൾക്ക് ഒരു തവണ മാത്രമേ ക്വിസിൽ പ്രവേശിക്കാൻ സാധിക്കൂ.          </p>
         
           <p className="study-intro">
* ക്വിസ് ആരംഭിച്ചുകഴിഞ്ഞാൽ പൂർത്തിയാക്കാതെ ബാക്ക് പോകാനോ പുറത്തിറങ്ങാനോ പാടില്ല; അങ്ങനെ ചെയ്താൽ നിങ്ങളുടെ എൻട്രി അസാധുവാകും.          </p>
       
         <p className="study-intro">
*  പേര്, ഫോൺ നമ്പർ തുടങ്ങിയ വിവരങ്ങൾ കൃത്യമായി രേഖപ്പെടുത്തുക.          </p>
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

      {error && (
        <div className="form-error-modal-backdrop">
          <section
            className="form-error-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="form-error-title"
            aria-describedby="form-error-message"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setError("");
              }
            }}
          >
            <h2 id="form-error-title">Unable to start the quiz</h2>
            <p id="form-error-message" className="quiz-error form-error-modal-message">
              {error}
            </p>
            <button
              className="next-button form-error-modal-button"
              type="button"
              autoFocus
              onClick={() => setError("")}
            >
              OK
            </button>
          </section>
        </div>
      )}
    </main>
  );
}