"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./admin.css";
import {
  clearAdminSession,
  getAdminSession,
} from "./session";
import Image from "next/image";

const QUIZ_STATUS_KEY = "al-markazul-quiz-status";

const emptySummary = {
	total: 0,
	male: 0,
	female: 0,
	kids: 0,
	kidsMale: 0,
	kidsFemale: 0,
	inProgress: 0,
	completed: 0,
	fastestFinish: null,
};

const QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "How many verses are in the Quran?",
    options: [
      "114",
      "120",
      "100",
      "130",
    ],
    answer: "114",
  },
  {
    id: 2,
    question: "which surah has the most verses?",
    options: [
      "Surah Al-Baqarah",
      "Surah Al-Imran",
      "Surah An-Nisa",
      "Surah Al-Ma'idah",
    ],
    answer: "Surah Al-Baqarah",
  },
  {
    id: 3,
    question: "Who is last and final prophet?",
    options: [
      "Prophet Muhammad (PBUH)",
      "Prophet Sulayman (PBUH)",
      "Prophet Musa (PBUH)",
      "Prophet Ibrahim (PBUH)",
    ],
    answer: "Prophet Muhammad (PBUH)",
  },
  {
    id: 4,
    question: "Which Prophet was given the ability to understand the language of birds?",
    options: [
      "Prophet Muhammad (PBUH)",
      "Prophet Sulayman (PBUH)",
      "Prophet Musa (PBUH)",
      "Prophet Ibrahim (PBUH)",
    ],
    answer: "Prophet Sulayman (PBUH)",
  },
  {
    id: 5,
    question: "The phrase وَمَن يَغْفِرُ الذُّنُوبَ إِلَّا اللَّهُ (“And who can forgive sins except Allah?”) is in:",
    options: [
      "Surah Al-Imran, Ayah 135",
      "Surah An-Nisa, Ayah 135",
      "Surah Al-Baqarah, Ayah 135",
      "Surah Al-furqan, Ayah 135",
    ],
    answer: "Surah Al-Imran, Ayah 135",
  },
];

function formatDuration(duration) {
	if (duration === null || duration === undefined) {
		return "--";
	}

	const seconds = Math.max(0, Math.round(duration / 1000));
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function formatDate(date) {
	if (!date) {
		return "--";
	}

	return new Intl.DateTimeFormat("en", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(date));
}

function getTimeTaken(startedAt, completedAt) {
	if (!startedAt) {
		return "--";
	}

	const start = new Date(startedAt).getTime();
	const end = completedAt ? new Date(completedAt).getTime() : Date.now();
	const duration = Math.max(0, end - start);

	if (completedAt) {
		return formatDuration(duration);
	}

	return "In progress";
}

export default function AdminPage() {
	const router = useRouter();
	const [authenticated, setAuthenticated] = useState(false);
	const [participants, setParticipants] = useState([]);
	const [summary, setSummary] = useState(emptySummary);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [activeView, setActiveView] = useState("leaderboard");
	const [quizStarted, setQuizStarted] = useState(false);
	const [statusUpdating, setStatusUpdating] = useState(false);

	useEffect(() => {
		 if (typeof window === "undefined") {
			 return;
		 }

		 const session = getAdminSession();

		if (!session) {
			router.replace("/admin/login");
			return;
		}

		 const syncQuizStatus = async () => {
			 try {
				 const response = await fetch("/api/quiz-status", {
					 cache: "no-store",
				 });

				 const data = await response.json();

				 if (!response.ok) {
					 throw new Error(data.message || "Failed to load quiz state.");
				 }

				 setQuizStarted(Boolean(data.isStarted));
			 } catch (requestError) {
				 console.error("Unable to sync quiz status:", requestError);
			 }
		 };

		 syncQuizStatus();
		setAuthenticated(true);
	}, [router]);

	const loadParticipants = async ({ silent = false } = {}) => {
		if (!silent) {
			setLoading(true);
		}
		setError("");

		try {
			const response = await fetch("/api/participants", {
				cache: "no-store",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to load participants.");
			}

			setParticipants(data.participants || []);
			setSummary(data.summary || emptySummary);
		} catch (requestError) {
			setError(requestError.message || "Failed to load participants.");
		} finally {
			if (!silent) {
				setLoading(false);
			}
		}
	};

	useEffect(() => {
		if (!authenticated) {
			return;
		}

		loadParticipants({ silent: true });
	}, [authenticated]);

	useEffect(() => {
		if (!authenticated || !quizStarted) {
			return;
		}

		const refreshInterval = setInterval(() => {
			loadParticipants({ silent: true });
		},2000);

		return () => clearInterval(refreshInterval);
	}, [authenticated, quizStarted]);

	 const handleStartQuiz = async () => {
		 setStatusUpdating(true);

		 try {
			 const response = await fetch("/api/quiz-status", {
				 method: "PATCH",
				 headers: {
					 "Content-Type": "application/json",
				 },
				 body: JSON.stringify({ isStarted: true }),
			 });

			 const data = await response.json();

			 if (!response.ok) {
				 throw new Error(data.message || "Failed to update quiz status.");
			 }

			 setQuizStarted(Boolean(data.isStarted));
		 } catch (requestError) {
			 setError(requestError.message || "Unable to change quiz status.");
		 } finally {
			 setStatusUpdating(false);
		 }
	};

	const handleEndQuiz = async () => {
		setStatusUpdating(true);

		try {
			const response = await fetch("/api/quiz-status", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ isStarted: false }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to end quiz.");
			}

			setQuizStarted(false);
		} catch (requestError) {
			setError(requestError.message || "Unable to end the quiz.");
		} finally {
			setStatusUpdating(false);
		}
	};

	const handleSignOut = () => {
		clearAdminSession();
		localStorage.removeItem(QUIZ_STATUS_KEY);
		setAuthenticated(false);
		setParticipants([]);
		setSummary(emptySummary);
		router.replace("/admin/login");
	};

	const exportCsv = () => {
		const headings = [
			"Participant ID",
			"Full Name",
			"Gender",
			"Age",
			"WhatsApp",
			"Status",
			"Score",
			"Total Questions",
			"Started At",
			"Completed At",
		];
		const rows = participants.map((participant) => [
			participant.participantId,
			participant.fullName,
			participant.gender,
			participant.age,
			participant.whatsapp,
			participant.status,
			participant.score,
			participant.totalQuestions,
			participant.startedAt,
			participant.completedAt || "",
		]);
		const csv = [headings, ...rows]
			.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
			.join("\n");
		const link = document.createElement("a");
		link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
		link.download = "al-markazul-participants.csv";
		link.click();
		URL.revokeObjectURL(link.href);
	};

	if (!authenticated) {
		return null;
	}

	const stats = [
		["Participants", summary.total],
		["Male", summary.male],
		["Female", summary.female],
		["Kids", summary.kids],
		["In progress", summary.inProgress],
		["Completed", summary.completed],
	];

	const leaderboardSections = [
		["all", "All participants"],
		["male", "Male participants"],
		["female", "Female participants"],
		["kidsMale", "Kids male participants"],
		["kidsFemale", "Kids female participants"],
	];

	const getLeaderboardParticipants = (group) => participants.filter((participant) => {
		if (group === "kidsMale") {
			return Number(participant.age) < 13 && participant.gender === "Male";
		}

		if (group === "kidsFemale") {
			return Number(participant.age) < 13 && participant.gender === "Female";
		}

		if (group === "male") {
			return participant.gender === "Male" && Number(participant.age) >= 13;
		}

		if (group === "female") {
			return participant.gender === "Female" && Number(participant.age) >= 13;
		}

		return true;
	});

	return (
		<main className="admin-page">
			<header className="admin-header">
                <div>
				<Image src="/logo.png" alt="logo" width="43" height="50" style={{ marginRight: "5px" }} /><Image src="/brand name.png" alt="Al Markazul Athari" width="130" height="40" />
                </div>
				<button className="admin-signout" onClick={handleSignOut}>Sign out</button>
			</header>

			<nav className="admin-tabs" aria-label="Admin sections">
				<button className={activeView === "questions" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveView("questions")}>Questions</button>
				<button className={activeView === "leaderboard" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveView("leaderboard")}>Leaderboard</button>
			</nav>

			<section className="admin-live-banner">
				<div className="live-copy"><span className="live-dot" /><div><strong>{quizStarted ? "Quiz is LIVE" : "Quiz not started"}</strong><span>{quizStarted ? "Attendees can register and take the quiz now." : "Press Start to open the quiz for participants."}</span></div></div>
				<div className="live-actions">
					<button className="started-pill" type="button" onClick={handleStartQuiz} disabled={quizStarted || statusUpdating}>
						{quizStarted ? "Started" : "Start"}
					</button>
					<button className="end-quiz-button" type="button" onClick={handleEndQuiz} disabled={!quizStarted || statusUpdating}>
						End
					</button>
				</div>
			</section>

			{activeView === "leaderboard" ? (
				<>
					<div className="admin-actions"><button onClick={loadParticipants} disabled={loading}>↻ Refresh</button></div>
					{error && <p className="admin-data-error">{error}</p>}
					<section className="admin-stats">{stats.map(([label, value]) => <article className={`stat-card${label === "Kids" ? " kids-stat-card" : ""}`} key={label}><span>{label}</span>{label !== "Kids" && <strong>{value}</strong>}{label === "Kids" && <div className="kids-gender-counts"><span className="kids-gender-badge male">M - <strong>{summary.kidsMale}</strong></span><span className="kids-gender-badge female">F - <strong>{summary.kidsFemale}</strong></span></div>}</article>)}</section>
					{leaderboardSections.map(([group, label]) => {
						const leaderboardParticipants = getLeaderboardParticipants(group);

						return (
							<section className="participants-panel" key={group}>
								<div className="panel-heading"><div><p className="admin-kicker">LIVE RESULTS</p><h2>{label}</h2></div><span>{leaderboardParticipants.length} records</span></div>
								<div className="table-wrap"><table><thead><tr><th>Name</th><th>Gender</th><th>Age</th><th>Status</th><th>Score</th><th>Time Taken</th><th>Started</th></tr></thead><tbody>{leaderboardParticipants.map((participant) => <tr key={participant._id || participant.participantId}><td><strong>{participant.fullName}</strong><small>{participant.participantId}</small></td><td>{participant.gender}</td><td>{participant.age}</td><td><span className={`status-badge ${participant.status}`}>{participant.status === "completed" ? "Completed" : "In progress"}</span></td><td>{participant.status === "completed" ? `${participant.score}/${participant.totalQuestions}` : "--"}</td><td>{getTimeTaken(participant.startedAt, participant.completedAt)}</td><td>{formatDate(participant.startedAt)}</td></tr>)}{!leaderboardParticipants.length && <tr><td colSpan="7" className="empty-state">{loading ? "Loading participants..." : "No participants in this leaderboard yet."}</td></tr>}</tbody></table></div>
							</section>
						);
					})}
				</>
			) : (
				<section className="questions-panel">
					<div className="panel-heading">
						<div>
							<p className="admin-kicker">QUESTIONS</p>
							<h2>Quiz questions</h2>
						</div>
						<span>{QUIZ_QUESTIONS.length} questions</span>
					</div>

					<div className="questions-list">
						{QUIZ_QUESTIONS.map((item) => (
							<article key={item.id} className="question-item">
								<div className="question-header">
									<span className="question-number-badge">Q{item.id}</span>
									<strong>{item.question}</strong>
								</div>

								<ul className="question-options">
									{item.options.map((option) => (
										<li
											key={option}
											className={
												option === item.answer ? "correct-option" : ""
											}
										>
											{option}
										</li>
									))}
								</ul>
							</article>
						))}
					</div>
				</section>
			)}
		</main>
	);
}
