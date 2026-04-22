import { NextResponse } from "next/server";

// GET /api/cron/omni-sync
//
// Vercel cron job — runs daily at 6 AM PT (13:00 UTC) on weekdays.
// Delegates to POST /api/ingest/omni with the internal cron header.
//
// Vercel automatically sets the CRON_SECRET and x-vercel-cron: 1 header.
// This route just re-invokes the ingest route internally.

export async function GET(request) {
  // Verify this is a legitimate Vercel cron call
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/ingest/omni`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-cron": "1",
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();
  console.log("[cron/omni-sync]", data);
  return NextResponse.json(data, { status: res.status });
}
