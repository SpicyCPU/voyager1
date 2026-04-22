// lib/omni-ingest.js
//
// Shared row processing logic for Omni Studio sign-up data.
// Used by both the manual trigger and the daily cron route.
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
import { eq } from "drizzle-orm";

export async function processOmniRows(rows, { mode = "pull", source = "omni_api" } = {}) {
  const results = { created: 0, updated: 0, skipped: 0, errors: [], mode, source };
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      const email = row["Email"]?.toString().trim();
      const name = row["Full Name"]?.toString().trim();
      if (!email || !name) { results.skipped++; continue; }

      const company =
        row["Account Name"]?.toString().trim() ||
        row["Studio Organization Name"]?.toString().trim();
      if (!company) { results.skipped++; continue; }

      const studioOrgName = row["Studio Organization Name"]?.toString().trim();

      // Build context summary
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
      if (row["Last Explorer Query Run Date"]) parts.push(`Explorer: ${row["Last Explorer Query Run Date"]}`);
      const extraContext = parts.join(" · ");

      // lastSignalAt — for studio signups use Studio creation date as the primary date;
      // "Last Seen At" reflects recent activity which isn't the meaningful signal here.
      let lastSignalAt = now;
      const rawDate = row["Created At Date"] || row["Last Seen At"];
      if (rawDate) {
        try { lastSignalAt = new Date(rawDate).toISOString(); } catch { /* ignore */ }
      }

      // Upsert account
      let account = await db.query.accounts.findFirst({
        where: eq(accounts.company, company),
      });
      if (!account) {
        const accountNotes = studioOrgName && studioOrgName !== company
          ? `Studio org: ${studioOrgName}` : null;
        [account] = await db.insert(accounts)
          .values({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, company, accountNotes })
          .returning();
      }

      const newSignal = { type: "platform_signup", source, mode, timestamp: lastSignalAt };

      // Dedup by email
      const existing = await db.query.leads.findFirst({ where: eq(leads.email, email) });

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
          createdAt: now, updatedAt: now,
          accountId: account.id,
          name, email,
          signalType: "platform_signup",
          signalHistory: JSON.stringify([newSignal]),
          lastSignalAt, extraContext,
          draftStatus: "idle",
        });
        results.created++;
      }
    } catch (err) {
      results.errors.push({ email: row["Email"] ?? "unknown", error: err.message });
    }
  }

  return results;
}

function parseHistory(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
