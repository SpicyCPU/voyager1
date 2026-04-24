import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts, appSettings, refinementExamples } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";
import { DEFAULT_RULES } from "@/app/api/settings/route";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const RESEARCH_CACHE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function POST(request, { params }) {
  const { id } = await params;

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { account: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Mark as running
  await db.update(leads)
    .set({ draftStatus: "running", updatedAt: new Date().toISOString() })
    .where(eq(leads.id, id));

  const generateStart = Date.now();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

    // Fetch writing rules from DB (fall back to defaults if not seeded yet)
    const settingsRow = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
    const rules = settingsRow?.rules ? JSON.parse(settingsRow.rules) : DEFAULT_RULES;

    // Fetch the 5 most recent refinement examples for few-shot injection
    const examples = await db.select()
      .from(refinementExamples)
      .orderBy(desc(refinementExamples.createdAt))
      .limit(5);

    const { account } = lead;

    // Step 1: Research summary — use cached account research if fresh (< 14 days)
    const researchAge = account.webResearchAt
      ? Date.now() - new Date(account.webResearchAt).getTime()
      : Infinity;
    const useCachedResearch = Boolean(account.webResearch) && researchAge < RESEARCH_CACHE_MS;

    let researchSummary;
    if (useCachedResearch) {
      researchSummary = account.webResearch;
    } else {
      const researchPrompt = buildResearchPrompt(lead, account);
      const researchRes = await callClaudeWithSearch(apiKey, researchPrompt);
      const rawResearch = extractText(researchRes);
      const { summary: parsedSummary, metadata } = parseResearchOutput(rawResearch);
      researchSummary = parsedSummary;

      const now2 = new Date().toISOString();
      await db.update(accounts)
        .set({
          webResearch: researchSummary,
          webResearchAt: now2,
          updatedAt: now2,
          ...(metadata?.industry && { industry: metadata.industry }),
          ...(metadata?.headcount && { headcount: metadata.headcount }),
          ...(metadata?.companyType && { companyType: metadata.companyType }),
        })
        .where(eq(accounts.id, account.id));
    }

    // Step 2: Email + LinkedIn draft
    const draftPrompt = buildDraftPrompt(lead, account, researchSummary, rules, examples);
    const draftRes = await callClaude(apiKey, draftPrompt);
    const draftText = extractText(draftRes);
    const parsed = parseJSON(draftText);

    const now = new Date().toISOString();
    const [result] = await db.update(leads)
      .set({
        researchSummary,
        emailSubject: parsed.email_subject ?? null,
        emailDraft: parsed.email_body ?? null,
        linkedinNote: parsed.linkedin_message ?? null,
        draftStatus: "done",
        updatedAt: now,
      })
      .where(eq(leads.id, id))
      .returning();

    const generateMs = Date.now() - generateStart;

    return NextResponse.json({
      lead: { ...result, account },
      researchSummary,
      emailSubject: parsed.email_subject,
      emailDraft: parsed.email_body,
      linkedinNote: parsed.linkedin_message,
      generateMs,
      ruleCount: rules.length,
    });
  } catch (err) {
    await db.update(leads)
      .set({ draftStatus: "error", updatedAt: new Date().toISOString() })
      .where(eq(leads.id, id));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildResearchPrompt(lead, account) {
  const lines = [
    `You are a B2B sales researcher at Apollo GraphQL. Synthesize the following signals about a prospect into a concise 3-5 bullet intelligence briefing. Each bullet should be one sentence — specific, actionable, no fluff. The goal is to support a rep booking an intro call — focus on signals that indicate organizational readiness and buying potential. Return findings directly — do not narrate your process, do not use phrases like "I'll search for", "Let me search", or "Based on my research". Start immediately with the first bullet.`,
    "",
    APOLLO_PRODUCT_CONTEXT,
    "",
    `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${account.company}`,
    account.sourcedVia ? `Note: this prospect works at ${account.sourcedVia}, which is an outsourced provider / vendor working for ${account.company}. Research the end client (${account.company}), not the vendor.` : "",
    lead.signalType ? `Signal type: ${lead.signalType}` : "",
    lead.visitedUrls ? `Pages visited:\n${lead.visitedUrls}` : "",
    lead.extraContext ? `Extra context: ${lead.extraContext}` : "",
    "",
    account.webResearch ? `COMPANY RESEARCH (${account.company}):\n${account.webResearch}` : "",
    account.edgarData ? `FINANCIAL / EARNINGS SIGNALS:\n${account.edgarData}` : "",
    account.jobSignals ? `JOB SIGNALS: ${account.jobSignals}` : "",
    account.accountNotes ? `ACCOUNT NOTES: ${account.accountNotes}` : "",
    account.crEnrichment ? `COMMON ROOM SIGNALS: ${account.crEnrichment}` : "",
    account.sfContext ? `SALESFORCE CONTEXT: ${account.sfContext}` : "",
    "",
    `COMPANY IDENTIFICATION RULE: If the company name looks like a personal Studio workspace (e.g. "[Name]'s Team", "[Name]'s Org", "[username]'s Workspace", or any variation of a personal name + possessive) — STOP. Do not research that name. It is not a real company. Instead, use the prospect's email domain to identify their real employer. A @comcast.net email means they work at Comcast. A @jpmorgan.com email means JPMorgan Chase. Research the real employer from the email domain, not the Studio org name.`,
    `If the company name looks like an internal team name (e.g. "Platform Team", "API Core", "GraphQL Infra") without a personal possessive, it may be a real org — use the email domain to confirm the parent company.`,
    ``,
    RESEARCH_INTEGRITY_RULES,
    ``,
    `After your intelligence bullets, append exactly this block (fill in values, do not skip):`,
    `---METADATA---`,
    `{"industry":"<fintech|healthcare|defense|logistics|retail|media|saas|consulting|government|manufacturing|other>","headcount":"<1-10|11-50|51-200|201-1000|1000+|unknown>","companyType":"<startup|scaleup|enterprise|consultancy|government|nonprofit|unknown>","salesQuality":"<high|medium|low>","hiddenOrg":"<parent company name or null>"}`,
  ].filter(Boolean).join("\n");

  return [{ role: "user", content: lines }];
}

// ── Research prompt instructions (appended to every research prompt) ──────────
// These are the anti-hallucination guards that must appear after all context.
const RESEARCH_INTEGRITY_RULES = `
CRITICAL — INTEGRITY RULES (non-negotiable):
- Only write bullets based on information you actually found and can cite. If you searched and found nothing about this person's specific work, role, or projects, say "No verifiable signals found for this individual" — do not fill the gap with plausible-sounding details.
- NEVER infer, guess, or extrapolate what the prospect might be working on. Do not write things like "likely working on X" or "probably using Y for Z" unless it's a direct quote or clearly stated fact from a source.
- NEVER fabricate a use case, technical problem, or implementation detail. If you don't have a source for it, leave it out.
- If the only signals are their email domain and a studio org name, say so. That is honest and useful. A sparse briefing is better than a fabricated one.
`.trim();

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

function buildDraftPrompt(lead, account, researchSummary, rules = [], examples = []) {
  const rulesText = rules.length > 0
    ? rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "1. Write like a human — conversational, specific, never templated";

  // Few-shot examples from past refinements — show the model what this rep actually prefers
  const emailExamples = examples.filter(e => e.field === "emailDraft");
  const linkedinExamples = examples.filter(e => e.field === "linkedinNote");

  // Few-shot style examples — "After" shows target voice, "Before" shows what was changed
  // Note: placed BEFORE rules so rules have higher recency weight and remain authoritative
  const fewShotBlock = [
    emailExamples.length > 0 && [
      `STYLE EXAMPLES — email (the "After" versions show this rep's preferred tone and style):`,
      ...emailExamples.map((e, i) => [
        `[${i + 1}] Feedback: "${e.feedback}"`,
        `After (target style): ${e.after}`,
      ].join("\n")),
    ].join("\n"),
    linkedinExamples.length > 0 && [
      `STYLE EXAMPLES — LinkedIn:`,
      ...linkedinExamples.map((e, i) => [
        `[${i + 1}] Feedback: "${e.feedback}"`,
        `After (target style): ${e.after}`,
      ].join("\n")),
    ].join("\n"),
  ].filter(Boolean).join("\n\n");

  // Tier-specific strategy injected into the prompt
  const tier = lead.extraContext?.match(/Tier:\s*(\S+)/i)?.[1]?.toUpperCase() ?? null;
  const tierGuidance = tier === "DEVELOPER"
    ? `TIER CONTEXT: This org is on the Developer plan — they are actively using GraphOS and have real intent. Focus the outreach on what's limiting them at current scale and position Standard or Enterprise as the natural next step. Be direct about the upgrade path.`
    : tier === "FREE" || tier === "FREE_PLAN"
    ? `TIER CONTEXT: This org is on the Free plan — intent quality varies widely. If the intel briefing shows strong org size, request volume, or team signals, treat them like a serious prospect. If signals are weak, keep the email lighter and focus on curiosity rather than urgency.`
    : null;

  const content = [
    `You are writing personalized outreach for an Apollo GraphQL sales rep. Return ONLY valid JSON matching this shape:`,
    `{"email_subject":"...","email_body":"...","linkedin_message":"..."}`,
    "",
    `GOAL: Book a 20-minute intro call. Not to pitch every feature — just earn a conversation. One specific hook, one clear ask. Never reference more than one product feature. If the intel briefing includes an executive quote or earnings signal about AI investment, data platform, or digital transformation — lead with that as the hook. Specific quotes from earnings calls or 10-Ks are highly effective openers.`,
    "",
    APOLLO_PRODUCT_CONTEXT,
    "",
    tierGuidance ?? "",
    "",
    `INTEL BRIEFING:\n${researchSummary}`,
    "",
    `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${account.company}`,
    account.sourcedVia ? `Note: this prospect's employer is ${account.sourcedVia} — an outsourced provider working for ${account.company}. Address them in that context: they're a practitioner/implementor, not the final decision maker. The outreach goal is ${account.company}.` : "",
    lead.linkedinUrl ? `LinkedIn: ${lead.linkedinUrl}` : "",
    account.accountNotes ? `\nACCOUNT NOTES: ${account.accountNotes}` : "",
    account.crEnrichment ? `\nCOMMON ROOM SIGNALS: ${account.crEnrichment}` : "",
    account.sfContext ? `\nSALESFORCE CONTEXT: ${account.sfContext}` : "",
    lead.visitedUrls ? `\nPAGES VISITED: ${lead.visitedUrls}` : "",
    fewShotBlock ? `\n${fewShotBlock}` : "",
    "",
    `WRITING RULES — follow every one of these precisely. These override everything above:`,
    rulesText,
    ``,
    `ANTI-HALLUCINATION RULES — these override everything, including style guidance above:`,
    `- NEVER mention a specific technical use case, feature, problem, or implementation unless it is explicitly stated verbatim in the INTEL BRIEFING with a clear source. Do not reach into your training knowledge about what GraphQL or GraphOS is "typically used for." If it is not in the briefing, it does not go in the email.`,
    `- NEVER name a customer in the email unless that company appears in the APOLLO CUSTOMERS list above AND the intel briefing gives a specific reason to reference them. Do not use customers as generic social proof — it reads as templated and is often irrelevant.`,
    `- SPARSE BRIEFING RULE: If the intel briefing is sparse, says "No verifiable signals found", or only mentions their plan tier and org name — write a SHORT email (under 60 words, body only) that: (1) acknowledges the signup by name, (2) asks one genuine open question about what they are building or trying to solve, (3) offers a brief call. Do NOT invent a hook, feature angle, use case, or customer reference. A short honest email outperforms a long fabricated one.`,
  ].filter(Boolean).join("\n");

  return [{ role: "user", content }];
}

// Plain Claude call — used for the draft step (no tools needed)
async function callClaude(apiKey, messages) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  return res.json();
}

// Claude with web search — used for the research step
// Handles tool_use loop: if Claude searches, we pass results back and get final answer
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
    if (!r.ok) { const err = await r.text(); throw new Error(`Anthropic API error ${r.status}: ${err}`); }
    return r.json();
  });

  let data = await makeCall(messages);

  // Handle tool_use: Claude searched — pass results back and get the final synthesized answer
  if (data.stop_reason === "tool_use") {
    const toolResults = data.content
      .filter(b => b.type === "tool_use")
      .map(b => ({
        type: "tool_result",
        tool_use_id: b.id,
        content: b.content ? JSON.stringify(b.content) : "No results",
      }));

    data = await makeCall([
      ...messages,
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults },
    ]);
  }

  return data;
}

function extractText(response) {
  return response.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try { return JSON.parse(match[0]); } catch { return {}; }
}
