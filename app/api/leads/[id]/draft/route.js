import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts, appSettings, refinementExamples } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";
import { DEFAULT_RULES } from "@/app/api/settings/route";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// POST /api/leads/[id]/draft
//
// Step 2 of the two-step flow.
// Reads the structured research brief from the lead and writes the email.
// The brief has already been validated and optionally edited by the rep.
// This prompt is intentionally simple — the hard decisions are upstream.
//
// Body (optional): { brief } — if provided, uses this brief instead of the stored one.
// Allows the rep to edit the brief in the UI and pass it directly without saving first.

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { account: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });

  // Use brief from request body if provided, otherwise use stored brief
  let brief = body.brief ?? null;
  if (!brief && lead.researchBrief) {
    try { brief = JSON.parse(lead.researchBrief); } catch {}
  }
  if (!brief) {
    return NextResponse.json({ error: "No research brief found. Run research first." }, { status: 400 });
  }

  // Save edited brief back if it came from the request
  if (body.brief) {
    await db.update(leads)
      .set({ researchBrief: JSON.stringify(body.brief), updatedAt: new Date().toISOString() })
      .where(eq(leads.id, id));
  }

  // Mark as drafting
  await db.update(leads)
    .set({ draftStatus: "drafting", updatedAt: new Date().toISOString() })
    .where(eq(leads.id, id));

  const { account } = lead;

  try {
    const [settingsRow, examples] = await Promise.all([
      db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") }),
      db.select().from(refinementExamples).orderBy(desc(refinementExamples.createdAt)).limit(5),
    ]);

    const rules = settingsRow?.rules ? JSON.parse(settingsRow.rules) : DEFAULT_RULES;
    const rulesText = rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

    const emailExamples = examples.filter(e => e.field === "emailDraft");
    const linkedinExamples = examples.filter(e => e.field === "linkedinNote");

    const fewShotBlock = [
      emailExamples.length > 0 && [
        `STYLE EXAMPLES — email (target tone and voice):`,
        ...emailExamples.map((e, i) => `[${i + 1}] Feedback: "${e.feedback}"\nAfter: ${e.after}`),
      ].join("\n"),
      linkedinExamples.length > 0 && [
        `STYLE EXAMPLES — LinkedIn:`,
        ...linkedinExamples.map((e, i) => `[${i + 1}] Feedback: "${e.feedback}"\nAfter: ${e.after}`),
      ].join("\n"),
    ].filter(Boolean).join("\n\n");

    const draftPrompt = buildDraftPrompt(lead, account, brief, rulesText, fewShotBlock);

    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: draftPrompt }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
    const parsed = parseJSON(text);

    const now = new Date().toISOString();
    const [updated] = await db.update(leads)
      .set({
        emailSubject: parsed.email_subject ?? null,
        emailDraft: parsed.email_body ?? null,
        linkedinNote: parsed.linkedin_message ?? null,
        draftStatus: "done",
        updatedAt: now,
      })
      .where(eq(leads.id, id))
      .returning();

    return NextResponse.json({
      lead: { ...updated, account },
      emailSubject: parsed.email_subject,
      emailDraft: parsed.email_body,
      linkedinNote: parsed.linkedin_message,
    });

  } catch (err) {
    await db.update(leads)
      .set({ draftStatus: "error", updatedAt: new Date().toISOString() })
      .where(eq(leads.id, id));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Draft prompt ──────────────────────────────────────────────────────────────
// Intentionally much simpler than the old generate prompt.
// The hard decisions (what's reliable, what tier of email) are already made in the brief.

function buildDraftPrompt(lead, account, brief, rulesText, fewShotBlock) {
  const { confidence, companyContext, hooks, openQuestion } = brief;
  const activeHooks = (hooks ?? []).filter(h => h.active !== false);
  const bestHook = activeHooks[0] ?? null;

  const approachInstructions = {
    rich: `You have strong, specific intel. Lead directly with the best hook — do not soften it or bury it. The email should feel like you did your homework on this exact company. 100-150 words max.`,
    medium: `You have company context but no specific hook. Write an email grounded in their business reality — their industry, scale, and domain. Ask the suggested question. Do not invent specific technical claims. 80-120 words.`,
    sparse: `Very little is known. Write a short, honest email (under 60 words): acknowledge the signup by name, ask the suggested question, offer a brief call. Nothing invented.`,
  }[confidence] ?? `Write a short, honest email. Ask the suggested question. Under 80 words.`;

  const content = [
    `You are writing a sales email for an Apollo GraphQL rep. Return ONLY valid JSON:`,
    `{"email_subject":"...","email_body":"...","linkedin_message":"..."}`,
    ``,
    APOLLO_PRODUCT_CONTEXT,
    ``,
    `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${account.company}`,
    lead.email ? `Email: ${lead.email}` : "",
    account.sourcedVia ? `Note: ${account.sourcedVia} is an outsourced provider for ${account.company}. Address them as a practitioner.` : "",
    lead.linkedinUrl ? `LinkedIn: ${lead.linkedinUrl}` : "",
    ``,
    `COMPANY CONTEXT: ${companyContext}`,
    ``,
    activeHooks.length > 0
      ? `AVAILABLE HOOKS (use the best one — do not use more than one):\n${activeHooks.map((h, i) => `${i + 1}. [${h.type}] ${h.text}${h.source ? ` (${h.source})` : ""}`).join("\n")}`
      : `HOOKS: None available.`,
    ``,
    `SUGGESTED OPENING QUESTION: ${openQuestion}`,
    ``,
    `APPROACH (${confidence}): ${approachInstructions}`,
    ``,
    fewShotBlock || "",
    ``,
    `WRITING RULES:`,
    rulesText,
    ``,
    `FORBIDDEN OPENERS — do not start with any of these:`,
    `  ✗ "I noticed you recently..." / "I noticed you signed up..."`,
    `  ✗ "I saw that you..." / "I came across..."`,
    `  ✗ "I wanted to reach out..." / "I'm reaching out because..."`,
    `  ✗ "Hope this finds you..." / "My name is X from Apollo..."`,
    `  ✗ "Congratulations on..." / "Thanks for signing up..."`,
    ``,
    bestHook
      ? `START with hook #1 or the suggested question — one or the other, not both. Do not add preamble before the hook.`
      : `START with the suggested question or a direct statement about their business. No preamble.`,
    ``,
    `INTEGRITY: Do not add any claim, use case, or technical detail that is not in the hooks or company context above. What is not in the brief does not go in the email.`,
  ].filter(s => s !== null && s !== undefined).join("\n");

  return [{ role: "user", content }];
}

function parseJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return {};
}
