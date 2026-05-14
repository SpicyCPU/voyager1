import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts, refinementExamples } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// POST /api/leads/[id]/refine
//
// Two modes:
//   reSearch: false (default) — rewrite the current draft applying the feedback
//   reSearch: true            — run fresh web research guided by the feedback,
//                               merge with existing research, then rewrite
//
// Body: { field, feedback, currentText, reSearch? }

export async function POST(request, { params }) {
  const { id } = await params;
  const { field, feedback, currentText, reSearch = false } = await request.json();

  if (!["emailDraft", "linkedinNote", "emailSubject"].includes(field)) {
    return NextResponse.json({ error: "field must be emailDraft, emailSubject, or linkedinNote" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  let updatedText;

  if (reSearch) {
    // ── Re-search mode: find new intel, then rewrite ─────────────────────────
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, id),
      with: { account: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const { account } = lead;

    // Run fresh search guided by the feedback (treated as a known correction)
    const newResearch = await runFeedbackSearch(apiKey, lead, account, feedback);

    // Save only the new research appended to existing — do NOT re-inject the prior
    // as "PRIOR RESEARCH" because that contaminates future runs with stale claims.
    // New findings are appended with a date stamp so freshness is visible.
    if (newResearch) {
      const now2 = new Date().toISOString();
      const dateStamp = now2.slice(0, 10);
      const existing = account.webResearch?.trim() ?? "";
      const updated = existing
        ? `${existing}\n\n[Re-researched ${dateStamp} based on rep correction]\n${newResearch}`
        : newResearch;
      await db.update(accounts).set({
        webResearch: updated,
        webResearchAt: now2,
        updatedAt: now2,
      }).where(eq(accounts.id, account.id));
      // Use the updated research for the rewrite so the rewrite sees the full picture
      account = { ...account, webResearch: updated };
    }

    // Rewrite using only the clean updated research — not a labeled merge
    const researchForRewrite = account.webResearch ?? newResearch ?? "";
    updatedText = await rewriteWithResearch(apiKey, lead, account, currentText, feedback, researchForRewrite, field);

  } else {
    // ── Rewrite mode: apply feedback to current draft ────────────────────────
    updatedText = await rewriteDraft(apiKey, currentText, feedback, field);
  }

  // Store before/after as refinement example for future few-shot injection
  const now = new Date().toISOString();
  db.insert(refinementExamples).values({
    id: crypto.randomUUID(),
    createdAt: now,
    field,
    feedback,
    before: currentText,
    after: updatedText,
    leadId: id,
  }).catch(() => {});

  // Persist the updated draft
  await db.update(leads)
    .set({ [field]: updatedText, updatedAt: now })
    .where(eq(leads.id, id));

  return NextResponse.json({ updatedText, reSearched: reSearch });
}

// ── Simple rewrite (no new research) ─────────────────────────────────────────

async function rewriteDraft(apiKey, currentText, feedback, field) {
  const fieldLabel = field === "emailDraft" ? "sales email body"
    : field === "emailSubject" ? "email subject line"
    : "LinkedIn message";

  const instruction = field === "emailSubject"
    ? `Current subject line: ${currentText}\n\nFeedback: ${feedback}\n\nRewrite the subject line applying this feedback. Return only the new subject line — no quotes, no preamble, no explanation. Keep it concise (under 10 words ideally).`
    : `Current ${fieldLabel}:\n\n${currentText}\n\nFeedback: ${feedback}\n\nRewrite it applying this feedback exactly. Return only the rewritten text — no preamble, no explanation.`;

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: field === "emailSubject" ? 60 : 800,
      messages: [{ role: "user", content: instruction }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("").trim() ?? currentText;
}

// ── Feedback-guided web search ────────────────────────────────────────────────

async function runFeedbackSearch(apiKey, lead, account, feedback) {
  const prompt = [{
    role: "user",
    content: [
      `You are a sales researcher correcting a draft email for ${lead.name} at ${account.company}.`,
      ``,
      `The sales rep has flagged this issue with the current draft:`,
      `"${feedback}"`,
      ``,
      `IMPORTANT: Treat the rep's feedback as a known correction — they are telling you something in the current research or email is wrong or outdated. Your job is to:`,
      `1. Search for current, accurate information that reflects the true state of affairs`,
      `2. Prioritise sources from the last 2 years`,
      `3. If the rep is correcting a factual error (e.g. a company was acquired, a product was spun off, a person left), find sources that confirm the current accurate state`,
      ``,
      `Return 2-4 specific, citable bullet points. Each bullet must end with the full source URL in brackets [https://...]. Do not include bullets you cannot cite.`,
      ``,
      APOLLO_PRODUCT_CONTEXT,
      ``,
      `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${account.company}`,
      lead.visitedUrls ? `Pages visited: ${lead.visitedUrls}` : "",
      lead.extraContext ? `Context: ${lead.extraContext}` : "",
      ``,
      `If you find nothing useful, say so honestly rather than padding with generic claims.`,
    ].filter(Boolean).join("\n"),
  }];

  try {
    const data = await callClaudeWithSearch(apiKey, prompt);
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
    return text.trim() || null;
  } catch {
    return null;
  }
}

// ── Rewrite with merged research ──────────────────────────────────────────────

async function rewriteWithResearch(apiKey, lead, account, currentText, feedback, research, field) {
  const fieldLabel = field === "emailDraft" ? "sales email body" : "LinkedIn message";
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          `You are rewriting a ${fieldLabel} for an Apollo GraphQL sales rep.`,
          ``,
          `CURRENT DRAFT:\n${currentText}`,
          ``,
          `REP CORRECTION: ${feedback}`,
          `The rep has flagged something in the current draft as incorrect or outdated. You must address this directly.`,
          ``,
          `UPDATED RESEARCH:\n${research}`,
          ``,
          `RULES:`,
          `• The rep's correction takes precedence over anything in the current draft`,
          `• If the research contains entries marked "[Re-researched ...]", those are the most current — trust them over older bullets`,
          `• Actively remove from the rewrite any claim the correction or new research invalidates`,
          `• Do not soften or hedge the correction — if something is wrong, remove it entirely`,
          `• Use only what is in the research above — do not fabricate new claims`,
          `• Keep the same rough length unless the feedback asks to change it`,
          `• Do not start with "I noticed you" or "I saw that you"`,
          ``,
          `Return only the rewritten text, no preamble.`,
        ].filter(Boolean).join("\n"),
      }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? currentText;
}

// ── Claude with web search ────────────────────────────────────────────────────

async function callClaudeWithSearch(apiKey, messages) {
  const makeCall = (msgs) => fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: msgs,
    }),
    signal: AbortSignal.timeout(60000),
  }).then(async r => {
    if (!r.ok) throw new Error(`Anthropic error ${r.status}`);
    return r.json();
  });

  let data = await makeCall(messages);
  if (data.stop_reason === "tool_use") {
    const toolResults = data.content
      .filter(b => b.type === "tool_use")
      .map(b => ({ type: "tool_result", tool_use_id: b.id, content: b.content ? JSON.stringify(b.content) : "No results" }));
    data = await makeCall([
      ...messages,
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults },
    ]);
  }
  return data;
}
