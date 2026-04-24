import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/schema";
import { eq, inArray, sql } from "drizzle-orm";

// POST /api/ingest/omni-backfill?token=YOUR_INGEST_SECRET
//
// One-time backfill: receives the same Omni CSV/TSV delivery as the main webhook,
// but instead of inserting new leads, updates existing active leads to add:
//   - Studio Org: [name]  in extraContext
//   - ⚠️ Org has paid members — verify if net-new  (when applicable)
//
// Does NOT touch: deleted leads, draft content, signal history, or any other fields.
// Safe to run multiple times.

const PAID_TIERS = new Set(["TEAM", "BUSINESS", "ENTERPRISE", "BUSINESS_PLUS"]);

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const secret = process.env.INGEST_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let text;
  try { text = await request.text(); } catch {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }
  if (!text?.trim()) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const rows = parseCSV(text);
  if (rows.length === 0) return NextResponse.json({ error: "CSV empty or unreadable" }, { status: 400 });

  console.log(`[omni-backfill] ${rows.length} rows received`);

  // Build email → row map and paid-org set
  const emailToRow = new Map();
  const orgTierMap = new Map();

  for (const row of rows) {
    const email = row["Email"]?.toString().trim();
    const studioOrg = row["Studio Organization Name"]?.toString().trim() || "";
    const tier = row["Subscription Tier"]?.toString().trim().toUpperCase() || "";
    if (!email) continue;
    emailToRow.set(email, row);
    if (studioOrg) {
      if (!orgTierMap.has(studioOrg)) orgTierMap.set(studioOrg, new Set());
      orgTierMap.get(studioOrg).add(tier);
    }
  }

  const paidOrgs = new Set(
    [...orgTierMap.entries()]
      .filter(([, tiers]) => [...tiers].some(t => PAID_TIERS.has(t)))
      .map(([org]) => org)
  );

  // Fetch all active leads whose email is in this delivery
  const emails = [...emailToRow.keys()];
  const existingLeads = [];
  for (let i = 0; i < emails.length; i += 900) {
    const chunk = emails.slice(i, i + 900);
    const found = await db.query.leads.findMany({
      where: (l, { and, inArray, isNull }) => and(inArray(l.email, chunk), isNull(l.deletedAt)),
    });
    existingLeads.push(...found);
  }

  console.log(`[omni-backfill] ${existingLeads.length} active leads to update`);

  const now = new Date().toISOString();
  const BATCH = 50;

  // Build list of updates needed
  const updates = [];
  let skipped = 0;

  for (const lead of existingLeads) {
    const row = emailToRow.get(lead.email);
    if (!row) { skipped++; continue; }

    const studioOrg = row["Studio Organization Name"]?.toString().trim() || "";
    const orgHasPaid = studioOrg && paidOrgs.has(studioOrg);

    const existing = lead.extraContext ?? "";
    const stripped = existing
      .split(" · ")
      .filter(p => !p.startsWith("Studio Org:") && !p.startsWith("⚠️ Org has paid members"))
      .join(" · ");

    const prefix = [];
    if (studioOrg) prefix.push(`Studio Org: ${studioOrg}`);
    if (orgHasPaid) prefix.push("⚠️ Org has paid members — verify if net-new");

    const newContext = [...prefix, ...(stripped ? [stripped] : [])].join(" · ");
    if (newContext === existing) { skipped++; continue; }

    updates.push({ id: lead.id, extraContext: newContext });
  }

  // Batch updates using db.batch() — single HTTP round trip per chunk
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await db.batch(
      chunk.map(u =>
        db.update(leads).set({ extraContext: u.extraContext, updatedAt: now }).where(eq(leads.id, u.id))
      )
    );
    updated += chunk.length;
  }

  console.log(`[omni-backfill] done — updated: ${updated}, skipped: ${skipped}`);
  return NextResponse.json({ total: rows.length, existingLeads: existingLeads.length, updated, skipped });
}

// ── CSV/TSV parser (same as main webhook) ────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delim = tabCount > commaCount ? "\t" : ",";
  const headers = splitLine(headerLine, delim);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = splitLine(line, delim);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? "").trim()]));
  });
}

function splitLine(line, delim) {
  if (delim === "\t") return line.split("\t");
  const result = [];
  let current = "", inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}
