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

export async function POST(request) {
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