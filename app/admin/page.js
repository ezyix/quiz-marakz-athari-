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

function compareLeaderboardParticipants(first, second) {
	const firstCompleted = first.status === "completed";
	const secondCompleted = second.status === "completed";

	if (firstCompleted !== secondCompleted) {
		return firstCompleted ? -1 : 1;
	}

	if (!firstCompleted) {
		return 0;
	}

	const getScoreRate = (participant) => {
		const score = Number(participant.score);
		const totalQuestions = Number(participant.totalQuestions);
		return Number.isFinite(score) && Number.isFinite(totalQuestions) && totalQuestions > 0
			? score / totalQuestions
			: 0;
	};
	const scoreDifference = getScoreRate(second) - getScoreRate(first);

	if (scoreDifference !== 0) {
		return scoreDifference;
	}

	const getCompletionDuration = (participant) => {
		const start = new Date(participant.startedAt).getTime();
		const end = new Date(participant.completedAt).getTime();
		return Number.isFinite(start) && Number.isFinite(end) && end >= start
			? end - start
			: Number.POSITIVE_INFINITY;
	};

	const durationDifference = getCompletionDuration(first) - getCompletionDuration(second);
	return Number.isNaN(durationDifference) ? 0 : durationDifference;
}

async function createParticipantsPdf(participants) {
	const logoResponse = await fetch("/logo.png");
	if (!logoResponse.ok) {
		throw new Error(`Logo request failed with status ${logoResponse.status}.`);
	}
	const logoBitmap = await createImageBitmap(await logoResponse.blob());
	const logoCanvas = document.createElement("canvas");
	logoCanvas.width = 128;
	logoCanvas.height = 128;
	const logoContext = logoCanvas.getContext("2d");
	if (!logoContext) {
		logoBitmap.close();
		throw new Error("Unable to prepare the report logo.");
	}
	logoContext.fillStyle = "#ffffff";
	logoContext.fillRect(0, 0, logoCanvas.width, logoCanvas.height);
	logoContext.drawImage(logoBitmap, 0, 0, logoCanvas.width, logoCanvas.height);
	logoBitmap.close();
	const logoBase64 = logoCanvas.toDataURL("image/jpeg", 0.9).split(",")[1];
	const logoBinary = atob(logoBase64);

	const brandResponse = await fetch("/brand%20name.png");
	if (!brandResponse.ok) {
		throw new Error(`Brand name request failed with status ${brandResponse.status}.`);
	}
	const brandBitmap = await createImageBitmap(await brandResponse.blob());
	const brandCanvas = document.createElement("canvas");
	brandCanvas.width = 512;
	brandCanvas.height = Math.round(brandCanvas.width * brandBitmap.height / brandBitmap.width);
	const brandContext = brandCanvas.getContext("2d");
	if (!brandContext) {
		brandBitmap.close();
		throw new Error("Unable to prepare the report brand name.");
	}
	brandContext.fillStyle = "#ffffff";
	brandContext.fillRect(0, 0, brandCanvas.width, brandCanvas.height);
	brandContext.drawImage(brandBitmap, 0, 0, brandCanvas.width, brandCanvas.height);
	brandBitmap.close();
	const brandBase64 = brandCanvas.toDataURL("image/jpeg", 0.9).split(",")[1];
	const brandBinary = atob(brandBase64);

	const toPdfText = (value) =>
		String(value ?? "--")
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^\x20-\x7e]/g, "?")
			.replace(/[\\()]/g, "\\$&");
	const truncateText = (value, maxLength) => {
		const text = String(value ?? "--");
		return text.length > maxLength
			? `${text.slice(0, maxLength - 3)}...`
			: text;
	};
	const columns = [
		{ label: "Name", width: 205 },
		{ label: "Gender", width: 65 },
		{ label: "Age", width: 45 },
		{ label: "Status", width: 90 },
		{ label: "Score", width: 60 },
		{ label: "Time Taken", width: 100 },
		{ label: "Started", width: 205 },
	];
	const brandDisplayWidth = 90;
	const brandDisplayHeight = brandDisplayWidth * brandCanvas.height / brandCanvas.width;
	const columnPositions = columns.reduce((positions) => {
		const previousIndex = positions.length - 1;
		const previousPosition = previousIndex < 0 ? 36 : positions[previousIndex];
		const previousWidth = previousIndex < 0 ? 0 : columns[previousIndex].width;
		positions.push(previousPosition + previousWidth);
		return positions;
	}, []);
	const rowsPerPage = 20;
	const pages = [];
	const reportDate = new Intl.DateTimeFormat("en", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date());

	for (let index = 0; index < participants.length; index += rowsPerPage) {
		pages.push(participants.slice(index, index + rowsPerPage));
	}

	if (pages.length === 0) {
		pages.push([]);
	}

	const pageObjectIds = pages.map((_, index) => 6 + index * 2);
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
		`<< /Type /XObject /Subtype /Image /Width ${logoCanvas.width} /Height ${logoCanvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBinary.length} >>\nstream\n${logoBinary}\nendstream`,
		`<< /Type /XObject /Subtype /Image /Width ${brandCanvas.width} /Height ${brandCanvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${brandBinary.length} >>\nstream\n${brandBinary}\nendstream`,
	];

	pages.forEach((pageParticipants, index) => {
		const pageId = pageObjectIds[index];
		const contentId = pageId + 1;
		const tableTop = 445;
		const commands = [
			"0.78 0.84 0.89 RG 0.8 w 20 10 802 575 re S",
			"q",
			"30 0 0 30 36 544 cm",
			"/Logo Do",
			"Q",
			"q",
			`${brandDisplayWidth} 0 0 ${brandDisplayHeight} 76 ${544 + (30 - brandDisplayHeight) / 2} cm`,
			"/Brand Do",
			"Q",
			"BT",
			"/F1 9 Tf",
			"0.40 0.51 0.58 rg",
			`1 0 0 1 690 558 Tm`,
			`(${toPdfText(reportDate)}) Tj`,
			"ET",
			"BT",
			"/F1 15 Tf",
			"0.09 0.20 0.29 rg",
			"36 510 Td",
			"(Participant Data) Tj",
			"/F1 9 Tf",
			"0.40 0.51 0.58 rg",
			"0 -20 Td",
			`(Total participants: ${participants.length}) Tj`,
			"ET",
			"0.22 0.50 0.81 rg",
			`36 ${tableTop} ${columns.reduce((total, column) => total + column.width, 0)} 24 re f`,
		];

		commands.push(
			"BT",
			"/F1 8 Tf",
			"0.40 0.51 0.58 rg",
			`1 0 0 1 760 17 Tm`,
			`(Page ${index + 1} of ${pages.length}) Tj`,
			"ET"
		);
		commands.push("BT", "/F1 8 Tf", "1 1 1 rg");
		columns.forEach((column, columnIndex) => {
			commands.push(
				`1 0 0 1 ${columnPositions[columnIndex] + 6} ${tableTop + 9} Tm`,
				`(${toPdfText(column.label)}) Tj`
			);
		});
		commands.push("ET");

		if (!pageParticipants.length) {
			commands.push(
				"BT",
				"/F1 9 Tf",
				"0.40 0.51 0.58 rg",
				`42 ${tableTop - 15} Td`,
				"(No participants to display.) Tj",
				"ET"
			);
		}

		pageParticipants.forEach((participant, rowIndex) => {
			const rowTop = tableTop - rowIndex * 21;
			const rowBottom = rowTop - 21;
			const rowValues = [
				participant.fullName,
				participant.gender,
				participant.age,
				participant.status === "completed" ? "Completed" : "In progress",
				participant.status === "completed"
					? `${participant.score}/${participant.totalQuestions}`
					: "--",
				getTimeTaken(participant.startedAt, participant.completedAt),
				formatDate(participant.startedAt),
			];

			if (rowIndex % 2 === 0) {
				commands.push(`0.96 0.98 1 rg 36 ${rowBottom} 770 21 re f`);
			}
			commands.push(`0.86 0.91 0.94 RG 0.5 w 36 ${rowBottom} m 806 ${rowBottom} l S`);
			commands.push("BT", "/F1 8 Tf", "0.09 0.20 0.29 rg");
			rowValues.forEach((value, columnIndex) => {
				const maxLength = Math.floor((columns[columnIndex].width - 12) / 4.5);
				const outputValue = truncateText(value, maxLength);
				commands.push(
					`1 0 0 1 ${columnPositions[columnIndex] + 6} ${rowTop - 9} Tm`,
					`(${toPdfText(outputValue)}) Tj`
				);
			});
			commands.push("ET");

			if (participant.whatsapp) {
				commands.push(
					"BT",
					"/F1 6 Tf",
					"0.40 0.51 0.58 rg",
					`1 0 0 1 ${columnPositions[0] + 6} ${rowTop - 17} Tm`,
					`(${toPdfText(truncateText(participant.whatsapp, 38))}) Tj`,
					"ET"
				);
			}
		});

		const pageText = commands.join("\n");

		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> /XObject << /Logo 4 0 R /Brand 5 0 R >> >> /Contents ${contentId} 0 R >>`,
			`<< /Length ${pageText.length} >>\nstream\n${pageText}\nendstream`
		);
	});

	let pdf = "%PDF-1.4\n";
	const offsets = [0];

	objects.forEach((object, index) => {
		offsets.push(pdf.length);
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
	});

	const xrefOffset = pdf.length;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) {
		pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

	const pdfBytes = new Uint8Array(pdf.length);
	for (let index = 0; index < pdf.length; index += 1) {
		pdfBytes[index] = pdf.charCodeAt(index);
	}

	return new Blob([pdfBytes], { type: "application/pdf" });
}

export default function AdminPage() {
	const router = useRouter();
	const [authenticated, setAuthenticated] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [installPrompt, setInstallPrompt] = useState(null);
	const [installMessage, setInstallMessage] = useState("");
	const [installMessageVisible, setInstallMessageVisible] = useState(false);
	const [installMessageId, setInstallMessageId] = useState(0);
	const [isInstalled, setIsInstalled] = useState(false);
	const [participants, setParticipants] = useState([]);
	const [summary, setSummary] = useState(emptySummary);
	const [loading, setLoading] = useState(true);
	const [questionsLoading, setQuestionsLoading] = useState(true);
	const [participantsDeleting, setParticipantsDeleting] = useState(false);
	const [showClearDataModal, setShowClearDataModal] = useState(false);
	const [error, setError] = useState("");
	const [activeView, setActiveView] = useState("leaderboard");
	const [activeParticipantGroup, setActiveParticipantGroup] = useState("all");
	const [quizStarted, setQuizStarted] = useState(false);
	const [statusUpdating, setStatusUpdating] = useState(false);
	const [durationMinutes, setDurationMinutes] = useState("1");
	const [durationSaving, setDurationSaving] = useState(false);
	const [durationError, setDurationError] = useState("");
	const [durationSaved, setDurationSaved] = useState(false);
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

	const showInstallMessage = (message) => {
		setInstallMessage(message);
		setInstallMessageId((id) => id + 1);
	};

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
		const handleBeforeInstallPrompt = (event) => {
			event.preventDefault();
			setInstallPrompt(event);
		};
		const handleAppInstalled = () => {
			setInstallPrompt(null);
			setIsInstalled(true);
			showInstallMessage("Admin Quiz app installed.");
		};
		const standaloneQuery = window.matchMedia("(display-mode: standalone)");

		setIsInstalled(standaloneQuery.matches);
		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleAppInstalled);

		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
			window.removeEventListener("appinstalled", handleAppInstalled);
		};
	}, []);

	useEffect(() => {
		if (installMessageId === 0) {
			return;
		}

		setInstallMessageVisible(true);
		const hideTimeout = setTimeout(() => {
			setInstallMessageVisible(false);
		}, 4700);
		const clearTimeoutId = setTimeout(() => {
			setInstallMessage("");
		}, 5000);

		return () => {
			clearTimeout(hideTimeout);
			clearTimeout(clearTimeoutId);
		};
	}, [installMessageId]);

	useEffect(() => {
		let cancelled = false;

		const loadAdminDashboard = async () => {
			const authenticated = await getAdminSession();
			if (cancelled) {
				return;
			}

			if (!authenticated) {
				router.replace("/admin/login");
				return;
			}
			setAuthenticated(true);

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
					setDurationMinutes(String(Math.max(1, Math.round((data.durationSeconds ?? 60) / 60))));
			 } catch (requestError) {
				 console.error("Unable to sync quiz status:", requestError);
			 }
			};

			await syncQuizStatus();
		};

		loadAdminDashboard();
		return () => {
			cancelled = true;
		};
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
		setQuestionsLoading(true);
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
		} finally {
			setQuestionsLoading(false);
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

		loadParticipants();
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

	const handleSaveDuration = async (event) => {
		event.preventDefault();
		setDurationError("");
		setDurationSaved(false);
		setDurationSaving(true);

		try {
			const response = await fetch("/api/quiz-status", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ durationSeconds: Number(durationMinutes) * 60 }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Failed to save quiz duration.");
			}

			setDurationMinutes(String(Math.round(data.durationSeconds / 60)));
			setDurationSaved(true);
		} catch (requestError) {
			setDurationError(requestError.message || "Failed to save quiz duration.");
		} finally {
			setDurationSaving(false);
		}
	};

	const handleSignOut = async () => {
		setIsSigningOut(true);
		await clearAdminSession();
		localStorage.removeItem(QUIZ_STATUS_KEY);
		setAuthenticated(false);
		setParticipants([]);
		setSummary(emptySummary);
		router.replace("/admin/login");
	};

	const handleInstallApp = async () => {
		if (!installPrompt) {
			showInstallMessage(
				"To install, open your browser menu and choose Install app or Add to Home Screen."
			);
			return;
		}

		try {
			await installPrompt.prompt();
			const { outcome } = await installPrompt.userChoice;
			showInstallMessage(
				outcome === "accepted"
					? "Admin Quiz app installed."
					: "App installation was cancelled."
			);
		} catch (installError) {
			console.error("Admin app installation failed:", installError);
			showInstallMessage("Unable to install the app. Try your browser menu.");
		} finally {
			setInstallPrompt(null);
		}
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

	const handleDownloadParticipantsPdf = async () => {
		if (loading || participants.length === 0) {
			return;
		}

		showInstallMessage("Downloading participant data as PDF...");
		await new Promise((resolve) => window.setTimeout(resolve, 100));

		try {
			const pdf = await createParticipantsPdf(participants);
			const url = URL.createObjectURL(pdf);
			const link = document.createElement("a");
			link.href = url;
			link.download = "al-markazul-participants.pdf";
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
			showInstallMessage("Downloading..");
		} catch (downloadError) {
			console.error("Participant PDF download failed:", downloadError);
			showInstallMessage("Unable to create the participant PDF.");
		}
	};

	if (!authenticated) {
		return (
			<main className="admin-page admin-session-loading-page">
				<div className="participants-loading-state" role="status">
					<span className="admin-loading-dots" aria-hidden="true">
						<span />
						<span />
						<span />
					</span>
					
				</div>
			</main>
		);
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
		["all", "All"],
		["male", "Male"],
		["female", "Female"],
		["kidsMale", "Kids - M"],
		["kidsFemale", "Kids - F"],
	];

	const getLeaderboardParticipants = (group) => participants
		.filter((participant) => {
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
		})
		.sort(compareLeaderboardParticipants);

	return (
		<main className="admin-page">
			<header className="admin-header">
                <div>
                <Image src="/logo.png" alt="logo" width="43" height="50" style={{ marginRight: "5px" }} /><Image src="/brand name.png" alt="Al Markazul Athari" width="130" height="40" />
				</div>
                <div className="admin-header-actions">
                	<button
						type="button"
						className="admin-signout"
						onClick={handleSignOut}
						disabled={isSigningOut}
						aria-label={isSigningOut ? "Signing out" : undefined}
					>
						{isSigningOut ? <span className="admin-loading-dots" aria-hidden="true"><span /><span /><span /></span> : "Sign out"}
					</button>
				</div>
			</header>
			{installMessage && (
				<div
					className={`admin-install-message${installMessageVisible ? " is-visible" : ""}`}
					role="status"
					aria-live="polite"
				>
					{installMessage}
				</div>
			)}

			<nav className="admin-tabs" aria-label="Admin sections">
				<button className={activeView === "questions" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveView("questions")}>Questions</button>
				<button className={activeView === "leaderboard" ? "admin-tab active" : "admin-tab"} onClick={() => setActiveView("leaderboard")}>Leaderboard</button>
			</nav>

			<section className="admin-live-banner">
				<div className="live-copy"><span className="live-dot" /><div><strong>{quizStarted ? "Quiz is LIVE" : "Quiz not started"}</strong><span>{quizStarted ? "Attendees can register and take the quiz now." : questions.length === 0 ? "Add at least one question before starting the quiz." : "Press Start to open the quiz for participants."}</span></div></div>
				<div className="live-actions">
					<button className="started-pill" type="button" onClick={handleStartQuiz} disabled={quizStarted || statusUpdating || questions.length === 0} title={questions.length === 0 ? "Add at least one question before starting" : undefined} aria-label={statusUpdating && !quizStarted ? "Starting quiz" : undefined}>
						{statusUpdating && !quizStarted ? <span className="admin-loading-dots" aria-hidden="true"><span /><span /><span /></span> : quizStarted ? "Started" : "Start"}
					</button>
					<button className="end-quiz-button" type="button" onClick={handleEndQuiz} disabled={!quizStarted || statusUpdating} aria-label={statusUpdating && quizStarted ? "Finishing quiz" : undefined}>
						{statusUpdating && quizStarted ? <span className="admin-loading-dots" aria-hidden="true"><span /><span /><span /></span> : "End"}
					</button>
				</div>
			</section>

			{activeView === "leaderboard" ? (
				<>
					<div className="admin-actions">
						<button className="refresh-participants-button" type="button" onClick={loadParticipants} disabled={loading}>↻ Refresh</button>
						<button
							type="button"
							className="download-participants-pdf"
							onClick={handleDownloadParticipantsPdf}
							disabled={loading || participants.length === 0}
						>
							<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M12 3v12m-5-5 5 5 5-5" />
								<path d="M5 17v3h14v-3" />
							</svg>
								Data  PDF
						</button>
						<button className="clear-participants-button" type="button" onClick={() => setShowClearDataModal(true)} disabled={quizStarted || participantsDeleting || participants.length === 0} title={quizStarted ? "End the quiz before clearing participant data." : undefined}>
							<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" />
							</svg>
							{participantsDeleting ? "Clearing..." : "Clear data"}
						</button>
					</div>
					{error && <p className="admin-data-error">{error}</p>}
					<section className="admin-stats">{stats.map(([label, value]) => <article className={`stat-card${label === "Kids" ? " kids-stat-card" : ""}`} key={label}><span>{label}</span>{loading ? <span className="admin-loading-dots" role="status" aria-label={`Loading ${label.toLowerCase()}`}><span /><span /><span /></span> : label !== "Kids" ? <strong>{value}</strong> : <div className="kids-gender-counts"><span className="kids-gender-badge male">M - <strong>{summary.kidsMale}</strong></span><span className="kids-gender-badge female">F - <strong>{summary.kidsFemale}</strong></span></div>}</article>)}</section>
					{leaderboardSections.filter(([group]) => group === activeParticipantGroup).map(([group, label]) => {
						const leaderboardParticipants = getLeaderboardParticipants(group);

						return (
							<section className="participants-panel" key={group}>
								{loading && (
									<div className="participants-loading-state" role="status">
										<span className="admin-loading-dots" aria-hidden="true"><span /><span /><span /></span>
										<span>Loading participants...</span>
									</div>
								)}
								<div className="panel-heading"><div><p className="admin-kicker">LIVE RESULTS</p><h2>Participants</h2></div><span>{leaderboardParticipants.length} records</span></div>
								<div className="admin-tabs participant-filter-tabs" role="tablist" aria-label="Filter participants">
									{leaderboardSections.map(([filterGroup, filterLabel]) => (
										<button
											className={`admin-tab${activeParticipantGroup === filterGroup ? " active" : ""}`}
											key={filterGroup}
											type="button"
											role="tab"
											aria-selected={activeParticipantGroup === filterGroup}
											onClick={() => setActiveParticipantGroup(filterGroup)}
										>
											{filterLabel}
										</button>
									))}
								</div>
								<div className="table-wrap"><table><thead><tr><th>Name</th><th>Gender</th><th>Age</th><th>Status</th><th>Score</th><th>Time Taken</th><th>Started</th></tr></thead><tbody>{leaderboardParticipants.map((participant) => <tr key={participant._id || participant.participantId}><td><strong className="participant-name"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" /></svg>{participant.fullName}</strong><small className="participant-whatsapp"><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.3.1-.4l.4-.4c.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.3-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.1 1.6 2.4 3.8 3.4.5.2.9.4 1.2.5.5.2 1 .2 1.3.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z" /></svg>{participant.whatsapp}</small></td><td>{participant.gender}</td><td>{participant.age}</td><td><span className={`status-badge ${participant.status}`}>{participant.status === "completed" ? "Completed" : "In progress"}</span></td><td>{participant.status === "completed" ? `${participant.score}/${participant.totalQuestions}` : "--"}</td><td>{getTimeTaken(participant.startedAt, participant.completedAt)}</td><td>{formatDate(participant.startedAt)}</td></tr>)}{!leaderboardParticipants.length && <tr><td colSpan="7" className="empty-state">{loading ? "Loading participants..." : "No participants ......"}</td></tr>}</tbody></table></div>
							</section>
						);
					})}
				</>
			) : (
				<section className="questions-panel">
					<div className="panel-heading">
					<div>
							<p className="admin-kicker">QUESTIONS</p>
							<p className="question-count">{questionsLoading ? <span className="admin-data-spinner" role="status" aria-label="Loading questions" /> : `Total - ${questions.length} Q`}</p>
						</div>
						<div className="question-panel-actions">
							<div className={`question-menu-container${questionMenuOpen ? " is-open" : ""}`} ref={questionMenuRef}>
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
									<>
										<div
											className="question-actions-backdrop"
											aria-hidden="true"
											onPointerDown={() => setQuestionMenuOpen(false)}
										/>
										<div className="question-actions-menu" id="question-actions-menu" aria-label="Question actions">
											<button type="button" onClick={() => { setQuestionMenuOpen(false); setShowQuestionModal(true); }} disabled={quizStarted || questionDeletingAll}>
												<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
													<path d="M12 5v14M5 12h14" />
												</svg>
												Add question
											</button>
											<button className="delete-all-questions-action" type="button" onClick={handleDeleteAllQuestions} disabled={!questions.length || quizStarted || questionDeletingAll}>
												<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
													<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" />
												</svg>
												{questionDeletingAll ? "Deleting..." : "Delete all questions"}
											</button>
										</div>
									</>
								)}
							</div>
						</div>
					</div>
					<form className="timer-settings-panel" onSubmit={handleSaveDuration}>
						<div className="timer-settings-heading">
							<span className="timer-icon-wrap" aria-hidden="true">
								<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
									<path d="M20 5h8M24 5v5M37.5 13.5l3-3M24 14v12l8 5M13 14H7m6 8H4m9 8H7" />
									<circle cx="24" cy="27" r="14" />
								</svg>
							</span>
							<div className="timer-settings-title">
								<p className="admin-kicker">QUIZ TIMER</p>
								<h2>Quiz duration</h2>
							</div>
						</div>
						<div className="timer-settings-controls">
							<div className="timer-duration-field">
								<label htmlFor="quiz-duration">
									<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<circle cx="12" cy="12" r="9" />
										<path d="M12 7v5l3 2" />
									</svg>
									Time limit
								</label>
								<div className="timer-duration-input">
									<input
										id="quiz-duration"
										name="durationMinutes"
										type="number"
										min="1"
										max="1440"
										step="1"
										value={durationMinutes}
										onChange={(event) => {
											setDurationMinutes(event.target.value);
											setDurationSaved(false);
										}}
										required
										disabled={quizStarted || durationSaving}
									/>
									<span>minutes</span>
								</div>
							</div>
							<button className="admin-primary-button timer-save-button" type="submit" disabled={quizStarted || durationSaving || !durationMinutes}>
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M5 3h12l4 4v14H3V3h2z" />
									<path d="M7 3v6h10V3M7 21v-8h10v8" />
								</svg>
								{durationSaving ? "Saving..." : durationSaved ? "Saved" : "Save time"}
							</button>
						</div>
						{durationError && <p className="admin-form-error" role="alert">{durationError}</p>}
						{quizStarted && <p className="question-management-lockout" role="status">End the quiz to change its duration.</p>}
					</form>
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
						{questionsLoading ? (
							<div className="questions-loading-state" role="status">
								<span className="admin-loading-dots" aria-hidden="true"><span /><span /><span /></span>
								<span>Loading questions...</span>
							</div>
						) : questions.map((item, index) => (
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
						{!questionsLoading && !questions.length && <p className="empty-questions-state">No questions yet. Add the first question to make the quiz available.</p>}
					</div>
					{!isInstalled && (
						<div className="admin-install-area">
							<div className="admin-install-copy">
								<div className="admin-install-icon-wrap" aria-hidden="true">
									<Image
										className="admin-install-logo"
										src="/logo.png"
										alt=""
										width={42}
										height={42}
									/>
								</div>
								<div>
									<h3>Install the Admin Quiz app</h3>
									<p>Open your quiz dashboard quickly from your home screen.</p>
								</div>
							</div>
							<button
								type="button"
								className="admin-install-button"
								onClick={handleInstallApp}
							>
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M12 3v12m-5-5 5 5 5-5" />
									<path d="M5 17v3h14v-3" />
								</svg>
								Install Admin Quiz App
							</button>
						</div>
					)}
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
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" />
								</svg>
								{participantsDeleting ? "Clearing..." : "Clear data"}
							</button>
						</div>
					</section>
				</div>
			)}
		</main>
	);
}
