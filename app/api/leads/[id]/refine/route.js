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

  if (!["emailDraft", "linkedinNote"].includes(field)) {
    return NextResponse.json({ error: "field must be emailDraft or linkedinNote" }, { status: 400 });
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

    // Run fresh search guided by the feedback
    const newResearch = await runFeedbackSearch(apiKey, lead, account, feedback);

    // Merge new research with existing
    const mergedResearch = [
      account.webResearch ? `PRIOR RESEARCH:\n${account.webResearch}` : "",
      newResearch ? `NEW RESEARCH (found based on feedback):\n${newResearch}` : "",
    ].filter(Boolean).join("\n\n");

    // Save new research back to account
    if (newResearch) {
      const now2 = new Date().toISOString();
      await db.update(accounts).set({
        webResearch: mergedResearch,
        webResearchAt: now2,
        updatedAt: now2,
      }).where(eq(accounts.id, account.id));
    }

    // Rewrite the email with merged research + feedback
    updatedText = await rewriteWithResearch(apiKey, lead, account, currentText, feedback, mergedResearch, field);

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
  const fieldLabel = field === "emailDraft" ? "sales email body" : "LinkedIn message";
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Current ${fieldLabel}:\n\n${currentText}\n\nFeedback: ${feedback}\n\nRewrite it applying this feedback exactly. Return only the rewritten text — no preamble, no explanation.`,
      }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json();
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? currentText;
}

// ── Feedback-guided web search ────────────────────────────────────────────────

async function runFeedbackSearch(apiKey, lead, account, feedback) {
  const prompt = [{
    role: "user",
    content: [
      `You are a sales researcher. A rep gave this feedback about a draft email for ${lead.name} at ${account.company}:`,
      `"${feedback}"`,
      ``,
      `The rep wants you to find new information that addresses this feedback. Search for it now and return what you find as 2-4 specific, citable bullet points. Each bullet must end with [source.com].`,
      ``,
      APOLLO_PRODUCT_CONTEXT,
      ``,
      `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${account.company}`,
      lead.visitedUrls ? `Pages visited: ${lead.visitedUrls}` : "",
      lead.extraContext ? `Context: ${lead.extraContext}` : "",
      ``,
      `Focus your search specifically on what the feedback is asking for. If the feedback asks about their funding, search for funding. If it asks about their CTO, search for their leadership. If it asks for a different angle, find that angle.`,
      `Return only what you found and can cite. If you found nothing useful, say so honestly.`,
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

async function rewriteWithResearch(apiKey, lead, account, currentText, feedback, mergedResearch, field) {
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
          `REP FEEDBACK: ${feedback}`,
          ``,
          `UPDATED RESEARCH (including new findings):\n${mergedResearch}`,
          ``,
          `Rewrite the ${fieldLabel} applying the feedback and incorporating any relevant new research findings. Use only what is in the research above — do not fabricate claims. Return only the rewritten text, no preamble.`,
          ``,
          `Keep the same rough length unless the feedback specifically asks to change it. Do not start with "I noticed you" or "I saw that you."`,
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
