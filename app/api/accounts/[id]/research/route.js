import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";

// POST /api/accounts/[id]/research
//
// Force-refreshes account-level research, ignoring the 14-day cache.
// Runs three parallel searches: web intel, job signals, SEC EDGAR.
// Writes webResearch + jobSignals + edgarData + webResearchAt atomically.
// Called by the "Refresh research" button in AccountResearch.js.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search" };

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
    // Run all three searches in parallel
    const [rawResearch, jobSignals, edgarData] = await Promise.all([
      runWebResearch(apiKey, account),
      runJobSignals(apiKey, account),
      runEdgarResearch(apiKey, account),
    ]);

    const { summary: webResearch, metadata } = parseResearchOutput(rawResearch);

    const now = new Date().toISOString();
    const [updated] = await db.update(accounts)
      .set({
        webResearch, jobSignals, edgarData, webResearchAt: now, updatedAt: now,
        ...(metadata?.industry && { industry: metadata.industry }),
        ...(metadata?.headcount && { headcount: metadata.headcount }),
        ...(metadata?.hq && { hq: metadata.hq }),
        ...(metadata?.companyType && { companyType: metadata.companyType }),
      })
      .where(eq(accounts.id, id))
      .returning();

    return NextResponse.json({ account: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function runWebResearch(apiKey, account) {
  const prompt = [
    `You are a B2B sales researcher at Apollo GraphQL. Search the web and write a concise 4-6 bullet intelligence briefing on "${account.company}" for a sales rep. Each bullet should be one sentence — specific, actionable, no fluff. Return your findings directly — do not narrate your search process, do not include phrases like "I'll search for", "Let me search", or "Based on my research". Start immediately with the first bullet.`,
    ``,
    APOLLO_PRODUCT_CONTEXT,
    ``,
    `Focus on: what the company does, their tech stack (GraphQL/REST/microservices signals), recent funding or M&A, headcount and growth trends, and anything that maps to Apollo's buying patterns (multiple API teams, REST modernization, platform team hiring, regulated/air-gapped environments).`,
    account.sourcedVia ? `Note: leads were sourced via ${account.sourcedVia} — research the end client (${account.company}), not the vendor.` : "",
    ``,
    account.accountNotes ? `EXISTING NOTES: ${account.accountNotes}` : "",
    ``,
    `After your intelligence bullets, append exactly this block:`,
    `---METADATA---`,
    `{"industry":"<fintech|healthcare|defense|logistics|retail|media|saas|consulting|government|manufacturing|other>","headcount":"<1-10|11-50|51-200|201-1000|1000+|unknown>","hq":"<City, Country or Country>","companyType":"<startup|scaleup|enterprise|consultancy|government|nonprofit|unknown>"}`,
  ].filter(Boolean).join("\n");

  return callClaudeWithSearch(apiKey, [{ role: "user", content: prompt }]);
}

async function runJobSignals(apiKey, account) {
  const prompt = `You are a B2B sales researcher at Apollo GraphQL. Search for recent job postings at "${account.company}" (last 6 months) and summarize 2-3 bullets on signals that suggest they are building or scaling API/GraphQL/platform infrastructure. Look for roles like: Staff/Principal Engineer, API Platform, GraphQL, Backend Platform, Developer Experience, Data Engineering. If no relevant signals found, say so in one line. Return findings directly — no narration, no "I'll search for", no "Based on my research" preamble. Start with the first bullet.`;
  return callClaudeWithSearch(apiKey, [{ role: "user", content: prompt }]);
}

async function runEdgarResearch(apiKey, account) {
  const prompt = `You are a B2B sales researcher at Apollo GraphQL. Search SEC EDGAR and financial news for "${account.company}". If public, summarize in 3-4 bullets: recent earnings highlights, revenue growth trend, technology investment mentions, and strategic priorities from their latest 10-K or earnings call. If private, search for funding rounds, investor announcements, or financial disclosures. If nothing findable, say so in one line. Return findings directly — no narration, no "I'll search for", no "Based on my research" preamble. Start with the first bullet.`;
  return callClaudeWithSearch(apiKey, [{ role: "user", content: prompt }]);
}

// Calls Claude with web_search tool, handles tool_use loop
async function callClaudeWithSearch(apiKey, messages) {
  let msgs = [...messages];

  for (let i = 0; i < 5; i++) {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        tools: [WEB_SEARCH_TOOL],
        messages: msgs,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();

    if (data.stop_reason === "end_turn") {
      return data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
    }

    if (data.stop_reason === "tool_use") {
      // Append assistant message and tool results, then loop
      msgs = [...msgs, { role: "assistant", content: data.content }];
      const toolResults = data.content
        .filter(b => b.type === "tool_use")
        .map(b => ({ type: "tool_result", tool_use_id: b.id, content: b.input?.query ?? "" }));
      msgs = [...msgs, { role: "user", content: toolResults }];
      continue;
    }

    // Unexpected stop reason — extract whatever text we have
    return data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
  }

  return "Research could not be completed.";
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
