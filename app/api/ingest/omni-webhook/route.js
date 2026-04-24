import { NextResponse } from "next/server";
import { processOmniRows } from "@/lib/omni-ingest";

// POST /api/ingest/omni-webhook?token=YOUR_INGEST_SECRET
//
// Receives raw CSV delivery from Omni scheduled webhook.
// Omni streams the file directly as the POST body with Content-Type: text/csv
// (or application/zip for multi-query dashboards — single query = plain CSV).
//
// Auth: ?token query param matched against INGEST_SECRET env var.
// No request body parsing needed — we read the raw text stream.

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const secret = process.env.INGEST_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }

  if (!text?.trim()) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const rows = parseCSV(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV empty or unreadable" }, { status: 400 });
  }

  console.log(`[omni-webhook] parsed ${rows.length} rows — processing net-new only`);

  const results = await processOmniRows(rows, { mode: "scheduled", source: "omni_webhook" });

  console.log("[omni-webhook]", { total: rows.length, ...results });
  return NextResponse.json({ total: rows.length, ...results });
}

// ── CSV/TSV parser — auto-detects delimiter from header row ──────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  // Detect delimiter: if header has more tabs than commas, it's TSV
  const headerLine = lines[0];
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delim = tabCount > commaCount ? "\t" : ",";

  const headers = splitLine(headerLine, delim);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = splitLine(line, delim);
      return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? "").trim()]));
    });
}

function splitLine(line, delim) {
  if (delim === "\t") return line.split("\t");
  // CSV: handle quoted fields with embedded commas
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}
