import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";

// GET /api/ingest/omni-debug
// Returns diagnostic info from the last Omni webhook delivery.
// Requires ?token= matching INGEST_SECRET so it's not public.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const secret = process.env.INGEST_SECRET;
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "omni_last_delivery") });
  if (!row) return NextResponse.json({ error: "No delivery recorded yet" });

  try {
    return NextResponse.json(JSON.parse(row.rules));
  } catch {
    return NextResponse.json({ raw: row.rules });
  }
}
