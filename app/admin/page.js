"use client";

import { useEffect, useRef, useState } from "react";
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
	const [participantsDeleting, setParticipantsDeleting] = useState(false);
	const [showClearDataModal, setShowClearDataModal] = useState(false);
	const [error, setError] = useState("");
	const [activeView, setActiveView] = useState("leaderboard");
	const [quizStarted, setQuizStarted] = useState(false);
	const [statusUpdating, setStatusUpdating] = useState(false);
	const [questions, setQuestions] = useState([]);
	const [questionDeleting, setQuestionDeleting] = useState("");
	const [questionPendingDelete, setQuestionPendingDelete] = useState(null);
	const [questionDeletingAll, setQuestionDeletingAll] = useState(false);
	const [questionMenuOpen, setQuestionMenuOpen] = useState(false);
	const questionMenuRef = useRef(null);
	const [showQuestionModal, setShowQuestionModal] = useState(false);
	const [questionSaving, setQuestionSaving] = useState(false);
	const [questionError, setQuestionError] = useState("");
	const [questionForm, setQuestionForm] = useState({
		question: "",
		options: ["", "", "", ""],
		answerIndex: "0",
	});

	useEffect(() => {
		if (!questionMenuOpen) {
			return;
		}

		const handleOutsideClick = (event) => {
			if (!questionMenuRef.current?.contains(event.target)) {
				setQuestionMenuOpen(false);
			}
		};

		const handleEscape = (event) => {
			if (event.key === "Escape") {
				setQuestionMenuOpen(false);
				questionMenuRef.current?.querySelector(".question-menu-trigger")?.focus();
			}
		};

		document.addEventListener("pointerdown", handleOutsideClick);
		document.addEventListener("keydown", handleEscape);

		return () => {
			document.removeEventListener("pointerdown", handleOutsideClick);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [questionMenuOpen]);

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

	const loadQuestions = async () => {
		setQuestionError("");

		try {
			const response = await fetch("/api/questions", {
				cache: "no-store",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to load questions.");
			}

			setQuestions(data.questions || []);
		} catch (requestError) {
			setQuestionError(requestError.message || "Failed to load questions.");
		}
	};

	const handleQuestionSubmit = async (event) => {
		event.preventDefault();
		if (quizStarted) {
			setQuestionError("End the quiz before adding questions.");
			return;
		}

		setQuestionError("");
		setQuestionSaving(true);

		try {
			const options = questionForm.options.map((option) => option.trim());
			const response = await fetch("/api/questions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					question: questionForm.question.trim(),
					options,
					answer: options[Number(questionForm.answerIndex)],
				}),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to add question.");
			}

			setQuestions((previous) => [...previous, data.question]);
			setQuestionForm({ question: "", options: ["", "", "", ""], answerIndex: "0" });
			setShowQuestionModal(false);
		} catch (requestError) {
			setQuestionError(requestError.message || "Failed to add question.");
		} finally {
			setQuestionSaving(false);
		}
	};

	const handleDeleteQuestion = async (item) => {
		if (!item) {
			return;
		}

		if (quizStarted) {
			setQuestionError("End the quiz before deleting questions.");
			return;
		}

		setQuestionDeleting(item._id);
		setQuestionError("");

		try {
			const response = await fetch(`/api/questions/${item._id}`, {
				method: "DELETE",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to delete question.");
			}

			setQuestions((previous) => previous.filter((question) => question._id !== item._id));
			setQuestionPendingDelete(null);
		} catch (requestError) {
			setQuestionError(requestError.message || "Failed to delete question.");
		} finally {
			setQuestionDeleting("");
		}
	};

	const handleDeleteAllQuestions = async () => {
		if (quizStarted) {
			setQuestionError("End the quiz before deleting questions.");
			setQuestionMenuOpen(false);
			return;
		}

		if (!questions.length) {
			setQuestionMenuOpen(false);
			return;
		}

		const confirmed = window.confirm(`Delete all ${questions.length} questions? This cannot be undone.`);
		setQuestionMenuOpen(false);

		if (!confirmed) {
			return;
		}

		setQuestionDeletingAll(true);
		setQuestionError("");

		try {
			const response = await fetch("/api/questions", { method: "DELETE" });
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to delete questions.");
			}

			setQuestions([]);
		} catch (requestError) {
			setQuestionError(requestError.message || "Failed to delete questions.");
		} finally {
			setQuestionDeletingAll(false);
		}
	};

	useEffect(() => {
		if (!authenticated) {
			return;
		}

		loadParticipants({ silent: true });
		loadQuestions();
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
		 if (questions.length === 0) {
			 setError("Add at least one question before starting the quiz.");
			 return;
		 }

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

	const handleClearParticipants = async () => {
		if (quizStarted || participants.length === 0) {
			setShowClearDataModal(false);
			return;
		}

		setParticipantsDeleting(true);
		setError("");

		try {
			const response = await fetch("/api/participants", { method: "DELETE" });
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to clear participant data.");
			}

			setParticipants([]);
			setSummary(emptySummary);
			setShowClearDataModal(false);
		} catch (requestError) {
			setError(requestError.message || "Failed to clear participant data.");
		} finally {
			setParticipantsDeleting(false);
		}
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
				<div className="live-copy"><span className="live-dot" /><div><strong>{quizStarted ? "Quiz is LIVE" : "Quiz not started"}</strong><span>{quizStarted ? "Attendees can register and take the quiz now." : questions.length === 0 ? "Add at least one question before starting the quiz." : "Press Start to open the quiz for participants."}</span></div></div>
				<div className="live-actions">
					<button className="started-pill" type="button" onClick={handleStartQuiz} disabled={quizStarted || statusUpdating || questions.length === 0} title={questions.length === 0 ? "Add at least one question before starting" : undefined}>
						{quizStarted ? "Started" : "Start"}
					</button>
					<button className="end-quiz-button" type="button" onClick={handleEndQuiz} disabled={!quizStarted || statusUpdating}>
						End
					</button>
				</div>
			</section>

			{activeView === "leaderboard" ? (
				<>
					<div className="admin-actions"><button type="button" onClick={loadParticipants} disabled={loading}>↻ Refresh</button><button className="clear-participants-button" type="button" onClick={() => setShowClearDataModal(true)} disabled={quizStarted || participantsDeleting || participants.length === 0} title={quizStarted ? "End the quiz before clearing participant data." : undefined}>{participantsDeleting ? "Clearing..." : "Clear data"}</button></div>
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
							<p className="question-count">{questions.length} </p>
						</div>
						<div className="question-panel-actions">
							<div className="question-menu-container" ref={questionMenuRef}>
								<button
									className="admin-primary-button question-menu-trigger"
									type="button"
									disabled={quizStarted || questionDeletingAll}
									aria-label={questionMenuOpen ? "Close question actions" : "Open question actions"}
									aria-haspopup="true"
									aria-expanded={questionMenuOpen}
									aria-controls="question-actions-menu"
									title={quizStarted ? "End the quiz to manage questions" : "Question actions"}
									onClick={() => setQuestionMenuOpen((open) => !open)}
								>
									<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
										{questionMenuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
									</svg>
								</button>
								{questionMenuOpen && (
									<div className="question-actions-menu" id="question-actions-menu" aria-label="Question actions">
										<button type="button" onClick={() => { setQuestionMenuOpen(false); setShowQuestionModal(true); }} disabled={quizStarted || questionDeletingAll}>
											Add question
										</button>
										<button className="delete-all-questions-action" type="button" onClick={handleDeleteAllQuestions} disabled={!questions.length || quizStarted || questionDeletingAll}>
											{questionDeletingAll ? "Deleting..." : "Delete all questions"}
										</button>
									</div>
								)}
							</div>
						</div>
					</div>
					{quizStarted && <p className="question-management-lockout" role="status">End the quiz to add or delete questions.</p>}

					{questionError && !showQuestionModal && <p className="admin-form-error">{questionError}</p>}

					{showQuestionModal && (
						<div
							className="question-modal-backdrop"
							role="presentation"
							onClick={(event) => {
								if (event.target === event.currentTarget) {
									setShowQuestionModal(false);
								}
							}}
						>
							<section
								className="question-modal"
								role="dialog"
								aria-modal="true"
								aria-labelledby="question-modal-title"
								tabIndex={-1}
								onKeyDown={(event) => {
									if (event.key === "Escape") {
										setShowQuestionModal(false);
									}
								}}
							>
								<div className="question-modal-heading">
									<h2 id="question-modal-title">Add question</h2>
									<button className="question-modal-close" type="button" aria-label="Close dialog" onClick={() => setShowQuestionModal(false)}>
										×
									</button>
								</div>
								{questionError && <p className="admin-form-error">{questionError}</p>}
								<form className="question-form" onSubmit={handleQuestionSubmit}>
							<label htmlFor="quiz-question">Question</label>
							<textarea
								id="quiz-question"
								value={questionForm.question}
								onChange={(event) => setQuestionForm((previous) => ({ ...previous, question: event.target.value }))}
								maxLength={500}
								required
								autoFocus
							/>
							<div className="question-option-fields">
								{questionForm.options.map((option, index) => (
									<div key={index}>
										<label htmlFor={`quiz-option-${index}`}>Option {index + 1}</label>
										<input
											id={`quiz-option-${index}`}
											value={option}
											onChange={(event) => setQuestionForm((previous) => ({
												...previous,
												options: previous.options.map((value, optionIndex) => optionIndex === index ? event.target.value : value),
											}))}
											maxLength={200}
											required
										/>
									</div>
								))}
							</div>
							<label htmlFor="quiz-answer">Correct answer</label>
							<select id="quiz-answer" value={questionForm.answerIndex} onChange={(event) => setQuestionForm((previous) => ({ ...previous, answerIndex: event.target.value }))}>
								{questionForm.options.map((option, index) => <option key={index} value={index}>Option {index + 1}{option.trim() ? `: ${option}` : ""}</option>)}
							</select>
							<button className="admin-primary-button" type="submit" disabled={questionSaving || quizStarted}>
								{quizStarted ? "Quiz is live" : questionSaving ? "Adding..." : "Save question"}
							</button>
						</form>
							</section>
						</div>
					)}

					<div className="questions-list">
						{questions.map((item, index) => (
							<article key={item._id} className="question-item">
								<div className="question-header">
									<span className="question-number-badge">Q{index + 1}</span>
									<strong>{item.question}</strong>
									<button
										type="button"
										className="question-delete-button"
										aria-label={questionDeleting === item._id ? `Deleting question ${index + 1}` : `Delete question ${index + 1}`}
										disabled={quizStarted || questionDeleting === item._id}
										title={questionDeleting === item._id ? "Deleting question" : quizStarted ? "End the quiz to delete questions" : "Delete question"}
										onClick={() => {
											setQuestionError("");
											setQuestionPendingDelete(item);
										}}
									>
										{questionDeleting === item._id ? (
											<span className="question-delete-spinner" aria-hidden="true" />
										) : (
											<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
												<path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v6m6-6v6" />
											</svg>
										)}
									</button>
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
						{!questions.length && <p className="empty-questions-state">No questions yet. Add the first question to make the quiz available.</p>}
					</div>
				</section>
			)}
			{questionPendingDelete && (
				<div
					className="question-modal-backdrop"
					role="presentation"
					onClick={(event) => {
						if (event.target === event.currentTarget && questionDeleting !== questionPendingDelete._id) {
							setQuestionPendingDelete(null);
							setQuestionError("");
						}
					}}
				>
					<section
						className="question-modal clear-data-modal"
						role="alertdialog"
						aria-modal="true"
						aria-labelledby="delete-question-title"
						aria-describedby="delete-question-warning"
						tabIndex={-1}
						onKeyDown={(event) => {
							if (event.key === "Escape" && questionDeleting !== questionPendingDelete._id) {
								setQuestionPendingDelete(null);
								setQuestionError("");
							}
						}}
					>
						<div className="question-modal-heading">
							<h2 id="delete-question-title">Delete this question?</h2>
							<button className="question-modal-close" type="button" aria-label="Cancel question deletion" onClick={() => { setQuestionPendingDelete(null); setQuestionError(""); }} disabled={questionDeleting === questionPendingDelete._id}>
								×
							</button>
						</div>
						<p className="clear-data-warning" id="delete-question-warning">
							<strong>{questionPendingDelete.question}</strong> will be permanently deleted. This action cannot be undone.
						</p>
						{questionError && <p className="admin-form-error" role="alert">{questionError}</p>}
						<div className="clear-data-actions">
							<button className="clear-data-cancel" type="button" onClick={() => { setQuestionPendingDelete(null); setQuestionError(""); }} disabled={questionDeleting === questionPendingDelete._id}>Cancel</button>
							<button className="clear-data-confirm" type="button" onClick={() => handleDeleteQuestion(questionPendingDelete)} disabled={questionDeleting === questionPendingDelete._id || quizStarted}>
								{questionDeleting === questionPendingDelete._id ? "Deleting..." : "Delete question"}
							</button>
						</div>
					</section>
				</div>
			)}
			{showClearDataModal && (
				<div
					className="question-modal-backdrop"
					role="presentation"
					onClick={(event) => {
						if (event.target === event.currentTarget && !participantsDeleting) {
							setShowClearDataModal(false);
						}
					}}
				>
					<section
						className="question-modal clear-data-modal"
						role="alertdialog"
						aria-modal="true"
						aria-labelledby="clear-data-title"
						aria-describedby="clear-data-warning"
						tabIndex={-1}
						onKeyDown={(event) => {
							if (event.key === "Escape" && !participantsDeleting) {
								setShowClearDataModal(false);
							}
						}}
					>
						<div className="question-modal-heading">
							<h2 id="clear-data-title">Clear all participant data?</h2>
							<button className="question-modal-close" type="button" aria-label="Cancel clearing data" onClick={() => setShowClearDataModal(false)} disabled={participantsDeleting}>
								×
							</button>
						</div>
						<p className="clear-data-warning" id="clear-data-warning">
							This will permanently delete all {participants.length} participant records, including their scores and leaderboard results. This action cannot be undone.
						</p>
						<div className="clear-data-actions">
							<button className="clear-data-cancel" type="button" onClick={() => setShowClearDataModal(false)} disabled={participantsDeleting}>Cancel</button>
							<button className="clear-data-confirm" type="button" onClick={handleClearParticipants} disabled={participantsDeleting}>
								{participantsDeleting ? "Clearing..." : "Clear data"}
							</button>
						</div>
					</section>
				</div>
			)}
		</main>
	);
}
