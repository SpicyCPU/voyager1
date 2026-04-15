import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";

// POST /api/accounts/[id]/research
//
// Force-refreshes account-level research, ignoring the 14-day cache.
// Runs web research focused on the company (no specific lead context).
// Writes webResearch + jobSignals + webResearchAt atomically.
// Called by the "Refresh research" button in AccountResearch.js.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function POST(request, { params }) {
  const { id } = await params;

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  try {
    // Run account-level research (no specific lead — company context only)
    const researchPrompt = buildAccountResearchPrompt(account);
    const researchRes = await callClaude(apiKey, researchPrompt);
    const rawResearch = extractText(researchRes);
    const { summary: webResearch, metadata } = parseResearchOutput(rawResearch);

    // Run job signals search
    const jobPrompt = buildJobSignalsPrompt(account);
    const jobRes = await callClaude(apiKey, jobPrompt);
    const jobSignals = extractText(jobRes);

    const now = new Date().toISOString();
    const [updated] = await db.update(accounts)
      .set({
        webResearch, jobSignals, webResearchAt: now, updatedAt: now,
        ...(metadata?.industry && { industry: metadata.industry }),
        ...(metadata?.headcount && { headcount: metadata.headcount }),
        ...(metadata?.companyType && { companyType: metadata.companyType }),
      })
      .where(eq(accounts.id, id))
      .returning();

    return NextResponse.json({ account: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildAccountResearchPrompt(account) {
  const content = [
    `You are a B2B sales researcher at Apollo GraphQL. Research the company "${account.company}" and write a concise 4-6 bullet intelligence briefing for a sales rep. Each bullet should be one sentence — specific, actionable, no fluff.`,
    ``,
    APOLLO_PRODUCT_CONTEXT,
    ``,
    `Focus on: what the company does, their tech stack signals (GraphQL/REST API usage, microservices, platform team signals), recent funding or M&A, headcount and growth, and any signals that map to Apollo's buying patterns above (especially: multiple API teams, REST modernization, current Serverless/Dedicated plan migration urgency, regulated/air-gapped environments).`,
    account.sourcedVia ? `Note: leads for this account were sourced via ${account.sourcedVia}. Research the end client (${account.company}), not the vendor/intermediary.` : "",
    ``,
    account.accountNotes ? `EXISTING NOTES: ${account.accountNotes}` : "",
    ``,
    `After your intelligence bullets, append exactly this block (fill in values, do not skip):`,
    `---METADATA---`,
    `{"industry":"<fintech|healthcare|defense|logistics|retail|media|saas|consulting|government|manufacturing|other>","headcount":"<1-10|11-50|51-200|201-1000|1000+|unknown>","companyType":"<startup|scaleup|enterprise|consultancy|government|nonprofit|unknown>"}`,
  ].filter(Boolean).join("\n");

  return [{ role: "user", content }];
}

function parseResearchOutput(text) {
  const parts = text.split(/---METADATA---/i);
  const summary = parts[0].trim();
  let metadata = null;
  if (parts[1]) {
    try {
      const match = parts[1].trim().match(/\{[\s\S]*?\}/);
      if (match) metadata = JSON.parse(match[0]);
    } catch {}
  }
  return { summary, metadata };
}

function buildJobSignalsPrompt(account) {
  const content = `You are a B2B sales researcher at Apollo GraphQL. Based on what you know about "${account.company}", summarize any relevant job postings or hiring signals that suggest they are building or scaling their API/GraphQL infrastructure. List 2-3 bullets. If no relevant signals exist, say "No relevant job signals found."`;
  return [{ role: "user", content }];
}

async function callClaude(apiKey, messages) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  return res.json();
}

function extractText(response) {
  return response.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
}
