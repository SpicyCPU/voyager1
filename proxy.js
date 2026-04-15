import { NextResponse } from "next/server";

const SESSION_COOKIE = "v1_session";

export function proxy(request) {
  const { pathname } = request.nextUrl;

  // Always allow: login page, auth API routes, ingest webhooks (have their own auth)
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/ingest")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const siteSecret = process.env.SITE_SECRET;

  if (!siteSecret) {
    // SITE_SECRET not configured — fail closed (deny all)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Server misconfigured: SITE_SECRET not set" },
        { status: 503 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (session !== siteSecret) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
