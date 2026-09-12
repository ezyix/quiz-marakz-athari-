export const ADMIN_SESSION_KEY = "al-markazul-admin-session";

export function getAdminSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawSession = localStorage.getItem(ADMIN_SESSION_KEY);

    if (!rawSession) {
      return null;
    }

    const session = JSON.parse(rawSession);

    if (!session?.token || !session?.expiresAt) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }

    const isExpired = Date.now() > Number(session.expiresAt);

    if (isExpired) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }

    return session;
  } catch (error) {
    console.error("Invalid admin session.", error);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

export function saveAdminSession() {
  if (typeof window === "undefined") {
    return;
  }

  const session = {
    token: "admin-token",
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));

  return session;
}

export function clearAdminSession() {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(ADMIN_SESSION_KEY);
}
