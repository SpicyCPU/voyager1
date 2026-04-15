import { NextResponse } from "next/server";

const SESSION_COOKIE = "v1_session";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

export async function POST(request) {
  const { password } = await request.json();
  const siteSecret = process.env.SITE_SECRET;

  if (!siteSecret) {
    return NextResponse.json({ error: "SITE_SECRET not configured" }, { status: 503 });
  }

  if (!password || password !== siteSecret) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, siteSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: ONE_YEAR_S,
    path: "/",
  });
  return res;
}
