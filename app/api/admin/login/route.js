import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminSessionMaxAge,
  createAdminSession,
  hasAdminAuthConfiguration,
  isSameOriginRequest,
  sessionCookieOptions,
  verifyAdminCredentials,
} from "../../../lib/auth";
import { limitFromEnv, rateLimit } from "../../../lib/rateLimit";

export async function POST(request) {
  const limited = rateLimit(request, {
    name: "admin-login",
    limit: limitFromEnv("RATE_LIMIT_LOGIN_PER_MIN", 5),
  });
  if (!limited.ok) {
    return NextResponse.json(
      { success: false, message: "Too many sign-in attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Cross-origin request denied." },
      { status: 403 }
    );
  }

  if (!hasAdminAuthConfiguration()) {
    return NextResponse.json(
      { success: false, message: "Admin sign-in is not configured." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid sign-in request." },
      { status: 400 }
    );
  }

  if (!verifyAdminCredentials(body?.email, body?.password)) {
    return NextResponse.json(
      { success: false, message: "Incorrect email or password." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    ADMIN_COOKIE,
    createAdminSession(),
    sessionCookieOptions(adminSessionMaxAge)
  );

  return response;
}