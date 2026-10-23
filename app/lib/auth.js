import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const ADMIN_COOKIE = "quiz_admin_session";
export const PARTICIPANT_COOKIE = "quiz_participant_session";

const SESSION_ISSUER = "al-markazul-athari-quiz";
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const PARTICIPANT_SESSION_SECONDS = 24 * 60 * 60;

function getSecret(name) {
  const secret = process.env[name];
  return typeof secret === "string" && secret.length >= 32 ? secret : null;
}

function readCookie(request, cookieName) {
  const cookieHeader = request.headers.get("cookie") || "";

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== cookieName) {
      continue;
    }

    return cookie.slice(separator + 1).trim();
  }

  return null;
}

function verifySession(request, cookieName, secretName, expectedRole) {
  const secret = getSecret(secretName);
  const token = readCookie(request, cookieName);

  if (!secret || !token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: expectedRole,
    });

    return payload.role === expectedRole ? payload : null;
  } catch {
    return null;
  }
}

function signSession(payload, secretName, audience, expiresIn) {
  const secret = getSecret(secretName);

  if (!secret) {
    throw new Error(`${secretName} must be configured with at least 32 characters.`);
  }

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    issuer: SESSION_ISSUER,
    audience,
    expiresIn,
  });
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return firstBuffer.length === secondBuffer.length &&
    crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

export function verifyAdminCredentials(email, password) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (
    !configuredEmail ||
    !configuredPassword ||
    configuredPassword.length < 5 ||
    !getSecret("ADMIN_SESSION_SECRET") ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return false;
  }

  return safeEqual(email.trim().toLowerCase(), configuredEmail) &&
    safeEqual(password, configuredPassword);
}

export function hasAdminAuthConfiguration() {
  return Boolean(
    process.env.ADMIN_EMAIL?.trim() &&
    process.env.ADMIN_PASSWORD &&
    process.env.ADMIN_PASSWORD.length >= 5 &&
    getSecret("ADMIN_SESSION_SECRET")
  );
}

export function createAdminSession() {
  return signSession(
    { role: "admin", sub: "admin" },
    "ADMIN_SESSION_SECRET",
    "admin",
    ADMIN_SESSION_SECONDS
  );
}

export function createParticipantSession(participantId) {
  return signSession(
    { role: "participant", sub: participantId },
    "PARTICIPANT_SESSION_SECRET",
    "participant",
    PARTICIPANT_SESSION_SECONDS
  );
}

export function isAdminRequest(request) {
  return Boolean(
    verifySession(request, ADMIN_COOKIE, "ADMIN_SESSION_SECRET", "admin")
  );
}

export function getParticipantId(request) {
  const session = verifySession(
    request,
    PARTICIPANT_COOKIE,
    "PARTICIPANT_SESSION_SECRET",
    "participant"
  );

  return typeof session?.sub === "string" ? session.sub : null;
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === new URL(request.url).origin;
}

export function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}

export const adminSessionMaxAge = ADMIN_SESSION_SECONDS;
export const participantSessionMaxAge = PARTICIPANT_SESSION_SECONDS;