import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq } from "drizzle-orm";

// POST /api/ingest/omni-sheet
//
// Called by the Google Apps Script that reads the "Omni Daily Uploads" Google Sheet.
// Accepts a JSON array of filtered rows from the sheet.
//
// Auth: x-ingest-secret header (same INGEST_SECRET used by Common Room webhook)
// Bypasses browser session auth because this route lives under /api/ingest/
//
// Modes (handled by Apps Script before sending — server just ingests):
//   initial — first run, high-value filtered rows only
//   daily   — incremental, new sign-ups since yesterday only
//
// Field mapping from Omni sheet columns:
//   Email                        → lead.email
//   Full Name                    → lead.name
//   Account Name || Studio Org   → account.company
//   Last Seen At                 → lead.lastSignalAt
//   Subscription Tier, Router,
//   Subgraphs, Requests, etc.    → lead.extraContext (formatted summary)

export async function POST(request) {
  // Auth
  const secret = process.env.INGEST_SECRET;
  const incoming = request.headers.get("x-ingest-secret") ?? "";
  if (!secret || incoming !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rows, mode } = body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  const results = { created: 0, updated: 0, skipped: 0, errors: [], mode: mode ?? "unknown" };
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      const email = row["Email"]?.toString().trim();
      const name = row["Full Name"]?.toString().trim();

      if (!email || !name) {
        results.skipped++;
        continue;
      }

      const company = row["Account Name"]?.toString().trim() || row["Studio Organization Name"]?.toString().trim();
      if (!company) {
        results.skipped++;
        continue;
      }

      const studioOrgName = row["Studio Organization Name"]?.toString().trim();

      // Build context summary from Omni signal fields
      const parts = [];
      if (row["Subscription Tier"]) parts.push(`Tier: ${row["Subscription Tier"]}`);
      if (row["Is Using Router"] === true || row["Is Using Router"] === "true") parts.push("Router: yes");
      const fedGraphs = parseInt(row["Total Federated Graphs"] ?? "0") || 0;
      const subgraphs = parseInt(row["Total Unique Subgraphs"] ?? "0") || 0;
      if (fedGraphs > 0) parts.push(`${fedGraphs} federated graph${fedGraphs !== 1 ? "s" : ""}`);
      else if (subgraphs > 0) parts.push(`${subgraphs} subgraph${subgraphs !== 1 ? "s" : ""}`);
      const activeUsers = parseInt(row["Total Active Users Last 30 Days"] ?? "0") || 0;
      if (activeUsers > 0) parts.push(`${activeUsers} active user${activeUsers !== 1 ? "s" : ""}`);
      const reqs = parseInt(row["Requests Last 30 Days"] ?? "0") || 0;
      if (reqs > 0) {
        const label = reqs >= 1_000_000
          ? `${(reqs / 1_000_000).toFixed(1)}M req/mo`
          : `${reqs.toLocaleString()} req/mo`;
        parts.push(label);
      }
      if (row["Has Router Operations Last 7days"] === true || row["Has Router Operations Last 7days"] === "true") {
        parts.push("Router active last 7d");
      }
      if (row["Last Explorer Query Run Date"]) parts.push(`Explorer: ${row["Last Explorer Query Run Date"]}`);

      const extraContext = parts.join(" · ");

      let lastSignalAt = now;
      if (row["Created At Date"]) {
        try { lastSignalAt = new Date(row["Created At Date"]).toISOString(); } catch { /* ignore */ }
      } else if (row["Last Seen At"]) {
        try { lastSignalAt = new Date(row["Last Seen At"]).toISOString(); } catch { /* ignore */ }
      }

      // Upsert account
      let account = await db.query.accounts.findFirst({
        where: eq(accounts.company, company),
      });
      if (!account) {
        const accountNotes = studioOrgName && studioOrgName !== company
          ? `Studio org: ${studioOrgName}`
          : null;
        [account] = await db.insert(accounts)
          .values({
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            company,
            accountNotes,
          })
          .returning();
      }

      const newSignal = {
        type: "platform_signup",
        source: "omni_sheet",
        mode: mode ?? "unknown",
        timestamp: lastSignalAt,
      };

      // Dedup by individual email
      const existing = await db.query.leads.findFirst({
        where: eq(leads.email, email),
      });

      if (existing) {
        const history = parseHistory(existing.signalHistory);
        history.push(newSignal);
        await db.update(leads)
          .set({
            signalHistory: JSON.stringify(history),
            lastSignalAt,
            extraContext: extraContext || existing.extraContext,
            updatedAt: now,
          })
          .where(eq(leads.id, existing.id));
        results.updated++;
      } else {
        await db.insert(leads).values({
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          accountId: account.id,
          name,
          email,
          signalType: "platform_signup",
          signalHistory: JSON.stringify([newSignal]),
          lastSignalAt,
          extraContext,
          draftStatus: "idle",
        });
        results.created++;
      }
    } catch (err) {
      results.errors.push({ email: row["Email"] ?? "unknown", error: err.message });
    }
  }

  return NextResponse.json({ total: rows.length, ...results });
}

function parseHistory(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
