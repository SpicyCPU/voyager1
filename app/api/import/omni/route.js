import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq } from "drizzle-orm";

// POST /api/import/omni
//
// Accepts a multipart form upload of the Omni Studio sign-ups CSV export.
// Parses each row, upserts accounts, and creates/updates leads.
//
// Dedup: by individual Email field (not Owner Email).
// If a lead with that email already exists → append signal to history.
// If not → create new lead with draftStatus=idle (ready to generate).
//
// Field mapping from CSV:
//   Email                        → lead.email
//   Full Name                    → lead.name
//   Account Name || Studio Org   → account.company
//   Last Seen At                 → lead.lastSignalAt
//   Subscription Tier, Router,
//   Subgraphs, Requests, etc.    → lead.extraContext (formatted summary)

export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file) {
    return NextResponse.json({ error: "No file field in form data" }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCSV(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV is empty or unreadable" }, { status: 400 });
  }

  const results = { created: 0, updated: 0, skipped: 0, errors: [] };
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      const email = row["Email"]?.trim();
      const name = row["Full Name"]?.trim();

      if (!email || !name) {
        results.skipped++;
        continue;
      }

      // Prefer Salesforce Account Name; fall back to Studio Org Name
      const company = row["Account Name"]?.trim() || row["Studio Organization Name"]?.trim();
      if (!company) {
        results.skipped++;
        continue;
      }

      const studioOrgName = row["Studio Organization Name"]?.trim();

      // Build a one-line context string from Omni signal fields
      const parts = [];
      if (row["Subscription Tier"]) parts.push(`Tier: ${row["Subscription Tier"]}`);
      if (row["Is Using Router"] === "true") parts.push("Router: yes");
      const subgraphs = parseInt(row["Total Unique Subgraphs"] ?? "0");
      const fedGraphs = parseInt(row["Total Federated Graphs"] ?? "0");
      if (fedGraphs > 0) parts.push(`${fedGraphs} federated graph${fedGraphs !== 1 ? "s" : ""}`);
      else if (subgraphs > 0) parts.push(`${subgraphs} subgraph${subgraphs !== 1 ? "s" : ""}`);
      const activeUsers = parseInt(row["Total Active Users Last 30 Days"] ?? "0");
      if (activeUsers > 0) parts.push(`${activeUsers} active user${activeUsers !== 1 ? "s" : ""}`);
      const reqs = parseInt(row["Requests Last 30 Days"] ?? "0");
      if (reqs > 0) {
        const label = reqs >= 1_000_000 ? `${(reqs / 1_000_000).toFixed(1)}M req/mo` : `${reqs.toLocaleString()} req/mo`;
        parts.push(label);
      }
      if (row["Has Router Operations Last 7days"] === "true") parts.push("Router active last 7d");
      if (row["Last Explorer Query Run Date"]) parts.push(`Explorer: ${row["Last Explorer Query Run Date"]}`);

      const extraContext = parts.join(" · ");

      // lastSignalAt: prefer Last Seen At, fall back to Created At, fall back to now
      let lastSignalAt = now;
      if (row["Last Seen At"]) {
        try { lastSignalAt = new Date(row["Last Seen At"]).toISOString(); } catch { /* ignore */ }
      } else if (row["Created At Date"]) {
        try { lastSignalAt = new Date(row["Created At Date"]).toISOString(); } catch { /* ignore */ }
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
        source: "omni_csv",
        timestamp: lastSignalAt,
      };

      // Dedup by individual email (global — not scoped to account)
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

// ─── CSV parser (handles quoted fields with commas) ───────────────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? "").trim()]));
    });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseHistory(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
