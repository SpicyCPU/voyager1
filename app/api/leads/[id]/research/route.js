import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const RESEARCH_CACHE_MS = 14 * 24 * 60 * 60 * 1000;

// POST /api/leads/[id]/research
//
// Step 1 of the two-step flow.
// Runs web research on the prospect's company, then returns a structured
// JSON brief — not a draft. The rep reviews and edits the brief before
// the draft step runs.
//
// Brief shape:
// {
//   confidence: "rich" | "medium" | "sparse",
//   companyContext: string,          // one sentence: who they are, scale, domain
//   hooks: [                         // ordered by strength, best first
//     { type: string, text: string, source: string|null }
//   ],
//   openQuestion: string,            // suggested question to open the email with
//   warnings: string[]               // flags: "personal workspace", "demo account", etc.
// }

export async function POST(request, { params }) {
  const { id } = await params;

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { account: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });

  const { account } = lead;

  // Mark as researching
  await db.update(leads)
    .set({ draftStatus: "researching", updatedAt: new Date().toISOString() })
    .where(eq(leads.id, id));

  try {
    // Use cached account research if fresh
    const researchAge = account.webResearchAt
      ? Date.now() - new Date(account.webResearchAt).getTime()
      : Infinity;
    const useCachedResearch = Boolean(account.webResearch) && researchAge < RESEARCH_CACHE_MS;

    let rawResearch;
    if (useCachedResearch) {
      rawResearch = account.webResearch;
    } else {
      rawResearch = await runWebResearch(apiKey, lead, account);
      await db.update(accounts)
        .set({ webResearch: rawResearch, webResearchAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(accounts.id, account.id));
    }

    // Build the structured brief
    const brief = await buildStructuredBrief(apiKey, lead, account, rawResearch);

    const now = new Date().toISOString();
    const [updated] = await db.update(leads)
      .set({
        researchSummary: rawResearch,   // keep raw for reference / legacy views
        researchBrief: JSON.stringify(brief),
        draftStatus: "briefed",
        updatedAt: now,
      })
      .where(eq(leads.id, id))
      .returning();

    return NextResponse.json({ lead: { ...updated, account }, brief });

  } catch (err) {
    await db.update(leads)
      .set({ draftStatus: "error", updatedAt: new Date().toISOString() })
      .where(eq(leads.id, id));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Web research (unchanged from generate route) ──────────────────────────────

async function runWebResearch(apiKey, lead, account) {
  const prompt = buildResearchPrompt(lead, account);
  const res = await callClaudeWithSearch(apiKey, prompt);
  // Strip ---METADATA--- block — we don't need it here, brief step handles classification
  return extractText(res).split(/---METADATA---/i)[0].trim();
}

function buildResearchPrompt(lead, account) {
  return [{
    role: "user",
    content: [
      `You are a B2B sales researcher at Apollo GraphQL. Search for information about this prospect and their company. Return 3-6 bullet points — each specific, factual, and citable. Do not narrate your process.`,
      ``,
      `SOURCE CITATION REQUIRED: Every bullet must end with [source.com]. No citation = do not include the claim.`,
      ``,
      APOLLO_PRODUCT_CONTEXT,
      ``,
      `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${account.company}`,
      account.sourcedVia ? `Note: prospect works at ${account.sourcedVia}, an outsourced provider for ${account.company}. Research ${account.company}, not the vendor.` : "",
      lead.signalType ? `Signal: ${lead.signalType}` : "",
      lead.visitedUrls ? `Pages visited:\n${lead.visitedUrls}` : "",
      lead.extraContext ? `Context: ${lead.extraContext}` : "",
      account.webResearch ? `PRIOR RESEARCH:\n${account.webResearch}` : "",
      account.edgarData ? `EDGAR/EARNINGS:\n${account.edgarData}` : "",
      account.jobSignals ? `JOB SIGNALS: ${account.jobSignals}` : "",
      account.accountNotes ? `ACCOUNT NOTES: ${account.accountNotes}` : "",
      ``,
      `COMPANY IDENTIFICATION: If the company name looks like a personal workspace ("[Name]'s Team", "[Name]'s Org") — stop. Use the email domain to identify the real employer instead.`,
      `INTERNAL vs PRODUCT: Research the company as an engineering org with internal systems, not as a product. If they make dev tools (Datadog, Stripe, etc.), focus on their internal engineering pains, not their product.`,
      ``,
      `INTEGRITY: Only include claims you found and can cite. If you found nothing specific, say so. A sparse truthful briefing beats a padded fabricated one.`,
    ].filter(Boolean).join("\n"),
  }];
}

// ── Structured brief builder ──────────────────────────────────────────────────
// Second LLM call — no web search, just classification + structuring.

async function buildStructuredBrief(apiKey, lead, account, rawResearch) {
  const visitedPages = lead.visitedUrls
    ? lead.visitedUrls.split("\n").map(u => u.trim()).filter(Boolean)
    : [];

  const prompt = [{
    role: "user",
    content: [
      `You are structuring a sales intelligence brief for an Apollo GraphQL rep. Given the raw research below, produce a JSON object with this exact shape:`,
      ``,
      `{`,
      `  "confidence": "rich" | "medium" | "sparse",`,
      `  "companyContext": "<one sentence: who they are, scale, domain>",`,
      `  "hooks": [`,
      `    { "type": "<exec_quote|page_visit|tech_signal|job_signal|news|earnings|tier>", "text": "<the hook, specific and direct>", "source": "<url or null>" }`,
      `  ],`,
      `  "openQuestion": "<one genuine question to ask this prospect based on what we know>",`,
      `  "warnings": ["<any flags: personal workspace, demo account, SI, India-based, etc.>"]`,
      `}`,
      ``,
      `CONFIDENCE LEVELS:`,
      `  rich   = has at least one specific, citable hook (exec quote, confirmed tech usage, earnings signal, specific job posting with tech named, page visit on a high-intent page like /enterprise or /federation)`,
      `  medium = has useful company context (industry, scale, domain) but no specific hook`,
      `  sparse = only email domain, tier, or org name — nothing else`,
      ``,
      `HOOKS — rank them best first. Include all valid hooks, remove weak or generic ones.`,
      `Page visits are always hooks if they visited a product-specific page (/federation, /enterprise, /pricing, /schema-checks, /contracts, /connectors).`,
      `Tier is a weak hook on its own — only include if paired with real usage signals.`,
      ``,
      `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${account.company}`,
      lead.email ? `Email: ${lead.email}` : "",
      visitedPages.length ? `Pages visited: ${visitedPages.join(", ")}` : "",
      lead.extraContext ? `Extra context: ${lead.extraContext}` : "",
      ``,
      `RAW RESEARCH:`,
      rawResearch || "(none)",
      ``,
      `Return ONLY the JSON object. No explanation, no markdown fences.`,
    ].filter(Boolean).join("\n"),
  }];

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: prompt }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  // Fallback if parse fails
  return {
    confidence: "sparse",
    companyContext: `${account.company} — no structured data available`,
    hooks: [],
    openQuestion: `What are you trying to solve with GraphQL at ${account.company}?`,
    warnings: ["brief parse failed — raw research available below"],
  };
}

// ── Claude with web search ────────────────────────────────────────────────────

async function callClaudeWithSearch(apiKey, messages) {
  const makeCall = (msgs) => fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: msgs,
    }),
    signal: AbortSignal.timeout(60000),
  }).then(async r => {
    if (!r.ok) throw new Error(`Anthropic error ${r.status}: ${await r.text()}`);
    return r.json();
  });

  let res = await makeCall(messages);

  // Handle tool_use loop
  while (res.stop_reason === "tool_use") {
    const toolUses = res.content.filter(b => b.type === "tool_use");
    const toolResults = toolUses.map(tu => ({
      type: "tool_result",
      tool_use_id: tu.id,
      content: tu.input?.query ? `Search executed for: ${tu.input.query}` : "Search completed",
    }));
    const nextMessages = [
      ...messages,
      { role: "assistant", content: res.content },
      { role: "user", content: toolResults },
    ];
    res = await makeCall(nextMessages);
  }

  return res;
}

function extractText(res) {
  return res.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
}
