import { NextResponse } from "next/server";
import { getDocumentQueries, runQuery } from "@/lib/omni";
import { processOmniRows } from "@/lib/omni-ingest";

const WORKBOOK_ID = "1:J8WzSKHq";

export async function POST() {
  const apiKey = process.env.OMNI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OMNI_API_KEY not configured" }, { status: 503 });
  }

  try {
    const queries = await getDocumentQueries(apiKey, WORKBOOK_ID);
    const queryList = Array.isArray(queries) ? queries : queries.queries ?? [];
    if (!queryList.length) {
      return NextResponse.json({ error: "No queries found in workbook" }, { status: 404 });
    }

    const rows = await runQuery(apiKey, queryList[0]);
    const results = await processOmniRows(rows, { mode: "manual", source: "omni_api" });

    return NextResponse.json({ total: rows.length, ...results });
  } catch (err) {
    console.error("[sync/omni]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
