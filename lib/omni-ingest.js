// lib/omni-ingest.js
//
// Shared row processing logic for Omni Studio sign-up data.
// Used by the daily scheduled webhook delivery from Omni.
//
// Strategy — net-new only:
//   • Pre-fetch ALL existing lead emails (including soft-deleted) in one query
//   • Pre-fetch ALL existing account companies in one query
//   • Skip any row whose email already exists (active OR deleted — respect curation)
//   • Insert only genuinely new leads/accounts in batches
//   • Never update existing leads (user has curated DB state manually)
//
// Field mapping (Omni column → Voyager 1 field):
//   Email                          → lead.email
//   Full Name                      → lead.name
//   Account Name | Studio Org Name → account.company
//   Last Seen At / Created At Date → lead.lastSignalAt
//   Subscription Tier              → extraContext: Tier
//   Is Using Router                → extraContext: Router
//   Total Federated Graphs         → extraContext: N federated graphs
//   Total Unique Subgraphs         → extraContext: N subgraphs
//   Total Active Users Last 30 Days→ extraContext: N active users
//   Requests Last 30 Days          → extraContext: XM req/mo
//   Has Router Operations Last 7days → extraContext: Router active last 7d
//   Last Explorer Query Run Date   → extraContext: Explorer date

import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { inArray } from "drizzle-orm";

// Batch size for DB inserts
const INSERT_BATCH = 50;

export async function processOmniRows(rows, { mode = "pull", source = "omni_api" } = {}) {
  const results = { created: 0, skipped: 0, errors: [], mode, source };
  const now = new Date().toISOString();

  // ── 1. Filter rows to ones with required fields ───────────────────────────
  const validRows = [];
  for (const row of rows) {
    const email = row["Email"]?.toString().trim();
    const name = row["Full Name"]?.toString().trim();
    const company =
      row["Account Name"]?.toString().trim() ||
      row["Studio Organization Name"]?.toString().trim();
    if (!email || !name || !company) {
      results.skipped++;
      continue;
    }
    validRows.push({ row, email, name, company });
  }

  console.log(`[omni-ingest] ${rows.length} rows in → ${validRows.length} have email+name+company, ${results.skipped} skipped (missing fields)`);
  if (validRows.length === 0) return results;

  // ── 2. Bulk-fetch all existing emails (active + soft-deleted) ─────────────
  const incomingEmails = validRows.map(r => r.email);
  // SQLite IN clause limit is 999; chunk if needed
  const existingEmailSet = new Set();
  for (let i = 0; i < incomingEmails.length; i += 900) {
    const chunk = incomingEmails.slice(i, i + 900);
    const rows = await db
      .select({ email: leads.email })
      .from(leads)
      .where(inArray(leads.email, chunk));
    rows.forEach(r => existingEmailSet.add(r.email));
  }

  // ── 3. Filter to genuinely new leads only ─────────────────────────────────
  const newRows = validRows.filter(({ email }) => !existingEmailSet.has(email));

  console.log(`[omni-ingest] ${existingEmailSet.size} emails already in DB → ${newRows.length} genuinely new`);
  if (newRows.length === 0) {
    results.skipped += validRows.length;
    return results;
  }

  // ── 4. Bulk-fetch existing accounts by company name ───────────────────────
  const incomingCompanies = [...new Set(newRows.map(r => r.company))];
  const existingAccountMap = new Map(); // company → account row
  for (let i = 0; i < incomingCompanies.length; i += 900) {
    const chunk = incomingCompanies.slice(i, i + 900);
    const rows = await db
      .select({ id: accounts.id, company: accounts.company })
      .from(accounts)
      .where(inArray(accounts.company, chunk));
    rows.forEach(r => existingAccountMap.set(r.company, r));
  }

  // ── 5. Identify companies that need to be created ─────────────────────────
  const newCompanies = incomingCompanies.filter(c => !existingAccountMap.has(c));

  // Map from company name → studioOrgName (for accountNotes)
  const companyToStudioOrg = new Map();
  for (const { row, company } of newRows) {
    const studioOrgName = row["Studio Organization Name"]?.toString().trim();
    if (!companyToStudioOrg.has(company)) {
      companyToStudioOrg.set(company, studioOrgName);
    }
  }

  // Insert new accounts in batches
  for (let i = 0; i < newCompanies.length; i += INSERT_BATCH) {
    const chunk = newCompanies.slice(i, i + INSERT_BATCH);
    const accountValues = chunk.map(company => {
      const studioOrgName = companyToStudioOrg.get(company);
      const accountNotes = studioOrgName && studioOrgName !== company
        ? `Studio org: ${studioOrgName}` : null;
      return {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        company,
        accountNotes,
      };
    });
    try {
      const inserted = await db.insert(accounts).values(accountValues).returning();
      inserted.forEach(a => existingAccountMap.set(a.company, a));
    } catch (err) {
      // If a company was inserted by a concurrent request, fetch it
      for (const company of chunk) {
        if (!existingAccountMap.has(company)) {
          try {
            const [found] = await db
              .select({ id: accounts.id, company: accounts.company })
              .from(accounts)
              .where(inArray(accounts.company, [company]));
            if (found) existingAccountMap.set(found.company, found);
          } catch { /* ignore */ }
        }
      }
    }
  }

  // ── 6. Build lead insert values ───────────────────────────────────────────
  const leadValues = [];
  for (const { row, email, name, company } of newRows) {
    const account = existingAccountMap.get(company);
    if (!account) {
      results.errors.push({ email, error: `No account found for company: ${company}` });
      continue;
    }

    const extraContext = buildExtraContext(row);
    const lastSignalAt = parseDate(row["Created At Date"] || row["Last Seen At"], now);
    const newSignal = { type: "platform_signup", source, mode, timestamp: lastSignalAt };

    leadValues.push({
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
  }

  // ── 7. Insert leads in batches ────────────────────────────────────────────
  for (let i = 0; i < leadValues.length; i += INSERT_BATCH) {
    const chunk = leadValues.slice(i, i + INSERT_BATCH);
    try {
      await db.insert(leads).values(chunk);
      results.created += chunk.length;
    } catch (err) {
      // Log individual errors for this batch
      for (const lead of chunk) {
        results.errors.push({ email: lead.email, error: err.message });
      }
    }
  }

  results.skipped += validRows.length - newRows.length;
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExtraContext(row) {
  const parts = [];
  if (row["Subscription Tier"]) parts.push(`Tier: ${row["Subscription Tier"]}`);
  if (row["Is Using Router"] === true || row["Is Using Router"] === "true") parts.push("Router: yes");
  const fedGraphs = Number(row["Total Federated Graphs"] ?? 0) || 0;
  const subgraphs  = Number(row["Total Unique Subgraphs"] ?? 0) || 0;
  if (fedGraphs > 0) parts.push(`${fedGraphs} federated graph${fedGraphs !== 1 ? "s" : ""}`);
  else if (subgraphs > 0) parts.push(`${subgraphs} subgraph${subgraphs !== 1 ? "s" : ""}`);
  const activeUsers = Number(row["Total Active Users Last 30 Days"] ?? 0) || 0;
  if (activeUsers > 0) parts.push(`${activeUsers} active user${activeUsers !== 1 ? "s" : ""}`);
  const reqs = Number(row["Requests Last 30 Days"] ?? 0) || 0;
  if (reqs > 0) {
    parts.push(reqs >= 1_000_000
      ? `${(reqs / 1_000_000).toFixed(1)}M req/mo`
      : `${reqs.toLocaleString()} req/mo`);
  }
  if (row["Has Router Operations Last 7days"] === true || row["Has Router Operations Last 7days"] === "true") {
    parts.push("Router active last 7d");
  }
  if (row["Is Using Schema Checks"] === true || row["Is Using Schema Checks"] === "TRUE") parts.push("Schema Checks: yes");
  if (row["Is Using Connectors"] === true || row["Is Using Connectors"] === "TRUE") parts.push("Connectors: yes");
  const proposals = Number(row["Proposals Created Count Last30d"] ?? 0) || 0;
  if (proposals > 0) parts.push(`${proposals} proposal${proposals !== 1 ? "s" : ""} last 30d`);
  const pq = Number(row["Persisted Queries Operation Count Last30d"] ?? 0) || 0;
  if (pq > 0) parts.push(`Persisted Queries: ${pq.toLocaleString()} ops`);
  if (row["Last Explorer Query Run Date"]) parts.push(`Explorer: ${row["Last Explorer Query Run Date"]}`);
  return parts.join(" · ");
}

function parseDate(raw, fallback) {
  if (!raw) return fallback;
  try { return new Date(raw).toISOString(); } catch { return fallback; }
}
