// scripts/backfill-account-meta.js
//
// One-time backfill: for every account that has idle/un-generated leads
// but is missing headcount or hq, ask Claude for a best-guess estimate.
//
// Run with:  bun run scripts/backfill-account-meta.js
// Dry run:   bun run scripts/backfill-account-meta.js --dry-run
//
// Uses Claude knowledge only (no web search) — fast, cheap, ~50ms per account.
// Estimates only; will be overwritten if the rep triggers full account research.

import { db } from "../lib/db.js";
import { accounts, leads } from "../lib/schema.js";
import { isNull, inArray, eq } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const DELAY_MS = 300; // stay well under rate limits

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ERROR: ANTHROPIC_API_KEY env var not set");
  process.exit(1);
}

// --- 1. Find accounts that need backfilling ---

const idleLeads = await db.query.leads.findMany({
  where: (l, { and, isNull, inArray, or, eq }) =>
    and(
      isNull(l.deletedAt),
      inArray(l.draftStatus, ["idle", "error"]),
      or(eq(l.outreachStatus, "draft"), isNull(l.outreachStatus))
    ),
  columns: { accountId: true },
});

const accountIdsWithIdleLeads = [...new Set(idleLeads.map(l => l.accountId).filter(Boolean))];

const allAccounts = await db.query.accounts.findMany({
  where: (a, { inArray }) => inArray(a.id, accountIdsWithIdleLeads),
});

// Only backfill accounts missing headcount OR hq
const toFill = allAccounts.filter(a => !a.headcount || !a.hq);

console.log(`\nAccounts with idle leads:  ${accountIdsWithIdleLeads.length}`);
console.log(`Already have metadata:     ${allAccounts.length - toFill.length}`);
console.log(`Need backfill:             ${toFill.length}`);

if (toFill.length === 0) {
  console.log("\nNothing to do — all accounts already have metadata.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("\n[DRY RUN] Would backfill:");
  toFill.forEach(a => console.log(`  - ${a.company} (headcount: ${a.headcount ?? "null"}, hq: ${a.hq ?? "null"})`));
  process.exit(0);
}

// --- 2. Claude lookup ---

async function lookupMeta(companyName) {
  const prompt = `You are a B2B sales data enrichment service. Provide structured metadata for this company.

Company: ${companyName}

Return ONLY valid JSON (no explanation, no markdown):
{
  "headcount": "<one of: 1-10, 11-50, 51-200, 201-1000, 1000+, unknown>",
  "hq": "<City, Country — or just Country if city unknown — or 'Unknown'>",
  "industry": "<one of: fintech, healthcare, defense, logistics, retail, media, saas, consulting, government, manufacturing, other>",
  "companyType": "<one of: startup, scaleup, enterprise, consultancy, government, nonprofit, unknown>"
}

Use your best knowledge. If genuinely unknown, use "unknown" for that field. Never leave a field blank.`;

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error(`No JSON in response: ${text}`);
  return JSON.parse(match[0]);
}

// --- 3. Run backfill ---

let filled = 0, skipped = 0, errors = 0;
const now = new Date().toISOString();

for (const account of toFill) {
  try {
    process.stdout.write(`  ${account.company.padEnd(40)} → `);
    const meta = await lookupMeta(account.company);

    await db.update(accounts)
      .set({
        headcount:   account.headcount   ?? meta.headcount   ?? null,
        hq:          account.hq          ?? meta.hq          ?? null,
        industry:    account.industry    ?? meta.industry    ?? null,
        companyType: account.companyType ?? meta.companyType ?? null,
        updatedAt: now,
      })
      .where(eq(accounts.id, account.id));

    console.log(`${meta.headcount} · ${meta.hq} · ${meta.industry}`);
    filled++;
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    errors++;
  }

  await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\n✅ Done — filled: ${filled}, errors: ${errors}`);
