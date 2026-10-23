import { NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdminRequest, isSameOriginRequest } from "../../../lib/auth";

export async function GET(request) {
  return NextResponse.json(
    { authenticated: isAdminRequest(request) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Cross-origin request denied." },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}