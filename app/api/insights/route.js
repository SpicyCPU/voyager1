import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts } from "@/lib/schema";
import { isNull } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "me.com", "mac.com", "live.com", "msn.com", "aol.com", "protonmail.com",
  "pm.me", "hey.com", "fastmail.com",
]);

const INDIA_CITIES = [
  "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune",
  "chennai", "kolkata", "noida", "gurgaon", "gurugram", "ahmedabad",
];

function isPersonalEmail(email) {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

function extractTier(extraContext) {
  return extraContext?.match(/Tier:\s*([^·\n]+)/i)?.[1]?.trim().toUpperCase() ?? null;
}

function isIndiaLead(extraContext, hq) {
  const loc = (extraContext?.match(/Location:\s*([^·\n]+)/i)?.[1] ?? "").toLowerCase();
  const hqStr = (hq ?? "").toLowerCase();
  return (
    loc.includes("india") || INDIA_CITIES.some(c => loc.includes(c)) ||
    hqStr.includes("india") || INDIA_CITIES.some(c => hqStr.includes(c))
  );
}

function isGitHubEnriched(extraContext) {
  return !!(extraContext?.match(/GitHub Co:\s*([^·\n]+)/i)?.[1]?.trim());
}

function hasPaidOrgWarning(extraContext) {
  return extraContext?.includes("⚠️ Org has paid members") ?? false;
}

// GET /api/insights
// Returns computed pipeline stats immediately.
// Add ?analyze=true to also get an AI lead-flow narrative.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const analyze = searchParams.get("analyze") === "true";

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // ── Fetch raw data ──────────────────────────────────────────────────────────
  const [allLeads, allAccounts] = await Promise.all([
    db.select({
      id: leads.id,
      accountId: leads.accountId,
      email: leads.email,
      signalType: leads.signalType,
      outreachStatus: leads.outreachStatus,
      draftStatus: leads.draftStatus,
      extraContext: leads.extraContext,
      createdAt: leads.createdAt,
      sentAt: leads.sentAt,
      deletedAt: leads.deletedAt,
    }).from(leads),
    db.select({
      id: accounts.id,
      industry: accounts.industry,
      headcount: accounts.headcount,
      companyType: accounts.companyType,
      hq: accounts.hq,
    }).from(accounts),
  ]);

  const accountMap = Object.fromEntries(allAccounts.map(a => [a.id, a]));
  const activeLeads = allLeads.filter(l => !l.deletedAt);
  const deletedLeads = allLeads.filter(l => l.deletedAt);

  // ── Funnel ──────────────────────────────────────────────────────────────────
  const generated = activeLeads.filter(l => l.draftStatus === "done").length;
  const sent = activeLeads.filter(l =>
    l.outreachStatus === "sent" || l.outreachStatus === "replied"
  ).length;
  const replied = activeLeads.filter(l => l.outreachStatus === "replied").length;
  const inQueue = activeLeads.filter(l => l.draftStatus === "idle").length;

  // ── Ingest velocity ─────────────────────────────────────────────────────────
  const now = Date.now();
  const MS_7D  = 7  * 24 * 60 * 60 * 1000;
  const MS_30D = 30 * 24 * 60 * 60 * 1000;
  const last7d  = activeLeads.filter(l => l.createdAt && (now - new Date(l.createdAt).getTime()) < MS_7D).length;
  const last30d = activeLeads.filter(l => l.createdAt && (now - new Date(l.createdAt).getTime()) < MS_30D).length;

  // ── Signal types ────────────────────────────────────────────────────────────
  const signalCounts = {};
  for (const l of activeLeads) {
    const k = l.signalType ?? "unknown";
    signalCounts[k] = (signalCounts[k] ?? 0) + 1;
  }

  // ── Tier breakdown ──────────────────────────────────────────────────────────
  const tierCounts = {};
  for (const l of activeLeads) {
    const t = extractTier(l.extraContext) ?? "unknown";
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }

  // ── Email type ──────────────────────────────────────────────────────────────
  let personalEmailCount = 0;
  let corporateEmailCount = 0;
  let noEmailCount = 0;
  for (const l of activeLeads) {
    if (!l.email) { noEmailCount++; continue; }
    if (isPersonalEmail(l.email)) personalEmailCount++;
    else corporateEmailCount++;
  }

  // ── Special lead types ──────────────────────────────────────────────────────
  let siCount = 0;
  let indiaCount = 0;
  let paidOrgCount = 0;
  let githubEnrichedCount = 0;
  for (const l of activeLeads) {
    const acct = accountMap[l.accountId];
    if (acct?.companyType === "consultancy") siCount++;
    if (isIndiaLead(l.extraContext, acct?.hq)) indiaCount++;
    if (hasPaidOrgWarning(l.extraContext)) paidOrgCount++;
    if (isGitHubEnriched(l.extraContext)) githubEnrichedCount++;
  }

  // ── Industries ──────────────────────────────────────────────────────────────
  const industryCounts = {};
  for (const a of allAccounts) {
    if (a.industry) industryCounts[a.industry] = (industryCounts[a.industry] ?? 0) + 1;
  }
  const topIndustries = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // ── Discard rate by signal ───────────────────────────────────────────────────
  const discardBySignal = {};
  for (const l of deletedLeads) {
    const k = l.signalType ?? "unknown";
    discardBySignal[k] = (discardBySignal[k] ?? 0) + 1;
  }

  const stats = {
    funnel: {
      total: activeLeads.length,
      inQueue,
      generated,
      sent,
      replied,
      discarded: deletedLeads.length,
    },
    ingest: {
      last7d,
      last30d,
      signals: Object.entries(signalCounts).sort((a, b) => b[1] - a[1]),
    },
    leadProfile: {
      tiers: Object.entries(tierCounts).sort((a, b) => b[1] - a[1]),
      emailTypes: { personal: personalEmailCount, corporate: corporateEmailCount, unknown: noEmailCount },
      special: { si: siCount, india: indiaCount, paidOrgWarning: paidOrgCount, githubEnriched: githubEnrichedCount },
    },
    topIndustries,
    discard: {
      total: deletedLeads.length,
      bySignal: Object.entries(discardBySignal).sort((a, b) => b[1] - a[1]),
    },
    generatedAt: new Date().toISOString(),
  };

  // ── AI narrative (on demand only) ───────────────────────────────────────────
  if (!analyze || !apiKey) {
    return NextResponse.json({ stats });
  }

  const dataBlock = [
    `PIPELINE FUNNEL:`,
    `  Total active leads: ${stats.funnel.total}`,
    `  In queue (unworked): ${stats.funnel.inQueue}`,
    `  Draft generated: ${stats.funnel.generated}`,
    `  Sent: ${stats.funnel.sent}`,
    `  Replied: ${stats.funnel.replied}`,
    `  Discarded as unqualified: ${stats.funnel.discarded}`,
    ``,
    `INGEST VELOCITY:`,
    `  New leads last 7 days: ${stats.ingest.last7d}`,
    `  New leads last 30 days: ${stats.ingest.last30d}`,
    ``,
    `LEAD SOURCES (signal type → count):`,
    stats.ingest.signals.map(([k, v]) => `  ${k}: ${v}`).join("\n") || "  (none)",
    ``,
    `PLAN TIER BREAKDOWN (active leads):`,
    stats.leadProfile.tiers.map(([k, v]) => `  ${k}: ${v}`).join("\n") || "  (none)",
    ``,
    `EMAIL TYPE:`,
    `  Corporate email: ${stats.leadProfile.emailTypes.corporate}`,
    `  Personal email (gmail etc.): ${stats.leadProfile.emailTypes.personal}`,
    ``,
    `SPECIAL LEAD TYPES:`,
    `  Consultancy / SI: ${stats.leadProfile.special.si}`,
    `  India-based (offshore): ${stats.leadProfile.special.india}`,
    `  Paid-org warning (free signup, org has paid members): ${stats.leadProfile.special.paidOrgWarning}`,
    `  De-anonymized via GitHub: ${stats.leadProfile.special.githubEnriched}`,
    ``,
    `TOP INDUSTRIES (accounts with metadata):`,
    stats.topIndustries.map(([k, v]) => `  ${k}: ${v}`).join("\n") || "  (no metadata yet)",
    ``,
    `DISCARDS BY SIGNAL TYPE:`,
    stats.discard.bySignal.map(([k, v]) => `  ${k}: ${v}`).join("\n") || "  (none)",
  ].join("\n");

  const prompt = [
    `You are analyzing the inbound lead pipeline for an Apollo GraphQL sales rep. Apollo GraphQL sells GraphOS — a platform for managing GraphQL APIs at scale, including Federation (composing many services into one graph), schema governance, observability, and performance.`,
    ``,
    APOLLO_PRODUCT_CONTEXT,
    ``,
    `PIPELINE DATA:`,
    dataBlock,
    ``,
    `Write a concise lead flow intelligence brief (4–5 short paragraphs, no headers, no bullet lists). Focus entirely on what the pipeline data reveals about the LEADS — not the rep's behavior. Cover:`,
    `1. What the ingest volume and signal mix says about where leads are coming from and how fast they are arriving`,
    `2. What the tier and email type breakdown reveals about the quality and intent of inbound leads — which segments look most promising`,
    `3. What the discard pattern reveals about which lead types have low conversion potential and may not be worth spending time on`,
    `4. What the industry mix (if populated) suggests about which verticals are most active`,
    `5. One concrete recommendation: where to focus effort, or what part of the pipeline deserves more attention`,
    ``,
    `Be direct and specific. Reference actual numbers. If the data is too sparse to draw conclusions, say so and suggest what would make this more useful. Do NOT comment on the rep's editing habits, writing style, or personal behavior.`,
  ].join("\n");

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
    const data = await res.json();
    const narrative = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
    return NextResponse.json({ stats, narrative });
  } catch (err) {
    // Return stats even if AI call fails
    return NextResponse.json({ stats, narrativeError: err.message });
  }
}
