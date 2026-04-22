import { NextResponse } from "next/server";
import { getDocumentQueries, runQuery } from "@/lib/omni";
import { processOmniRows } from "@/lib/omni-ingest";

// POST /api/ingest/omni
//
// Manual trigger: pulls the Studio sign-up workbook from Omni API and ingests rows.
// Auth: x-ingest-secret header (same INGEST_SECRET used elsewhere).
// Body (optional): { queryIndex: 0 }  — which query in the workbook to run (default 0).
//
// Also called internally by the daily cron at /api/cron/omni-sync.

const WORKBOOK_ID = "1:J8WzSKHq";

export async function POST(request) {
  const secret = process.env.INGEST_SECRET;
  const incoming = request.headers.get("x-ingest-secret") ?? "";
  // Also allow internal cron calls (Vercel sets x-vercel-cron: 1)
  const isCron = request.headers.get("x-vercel-cron") === "1";

  if (!isCron && (!secret || incoming !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OMNI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OMNI_API_KEY not set" }, { status: 503 });
  }

  let queryIndex = 0;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.queryIndex === "number") queryIndex = body.queryIndex;
  } catch { /* ignore */ }

  try {
    // 1. Fetch query definitions from workbook
    const queries = await getDocumentQueries(apiKey, WORKBOOK_ID);
    const queryList = Array.isArray(queries) ? queries : queries.queries ?? [];
    if (!queryList.length) {
      return NextResponse.json({ error: "No queries found in workbook" }, { status: 404 });
    }

    const query = queryList[queryIndex];
    if (!query) {
      return NextResponse.json(
        { error: `Query index ${queryIndex} out of range (${queryList.length} available)` },
        { status: 400 }
      );
    }

    // 2. Run the query — returns plain JS row objects
    const rows = await runQuery(apiKey, query);

    // 3. Process rows into Voyager 1 DB
    const results = await processOmniRows(rows, { mode: isCron ? "cron" : "manual", source: "omni_api" });

    return NextResponse.json({ workbook: WORKBOOK_ID, queryIndex, total: rows.length, ...results });
  } catch (err) {
    console.error("[omni-ingest]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
