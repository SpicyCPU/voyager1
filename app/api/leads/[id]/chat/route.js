import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseExtraContextForLLM } from "@/lib/parse-extra-context";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function POST(request, { params }) {
  const { id } = await params;
  const { messages } = await request.json();

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { account: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const productSignals = parseExtraContextForLLM(lead.extraContext);

  // Build system prompt with full context about this lead and what was written
  const systemPrompt = [
    `You are a B2B sales assistant at Apollo GraphQL. You previously researched a prospect and wrote a sales email draft. The sales rep is now asking you questions about your reasoning, the research you found, and the choices you made in the email.`,
    ``,
    `Be transparent and specific. If a claim in the email was inferred rather than directly found, say so. If you're uncertain about something, admit it. If the rep asks why you used a specific hook or reference, explain exactly what in the research led you there.`,
    ``,
    `IMPORTANT: The product usage signals below come directly from the GraphOS platform database — they are hard facts about what this account is actually doing, not inferences. When the rep asks what data you have, describe these signals specifically and accurately.`,
    ``,
    `LEAD:`,
    `Name: ${lead.name}${lead.title ? ` · ${lead.title}` : ""}`,
    lead.email ? `Email: ${lead.email}` : "",
    lead.account?.company ? `Company: ${lead.account.company}` : "",
    lead.signalType ? `Signal: ${lead.signalType.replace(/_/g, " ")}` : "",
    lead.visitedUrls ? `Pages visited on apollographql.com:\n${lead.visitedUrls}` : "",
    productSignals
      ? `PRODUCT USAGE SIGNALS (platform database facts — not inferences):\n${productSignals}`
      : lead.extraContext
        ? `Platform context: ${lead.extraContext}`
        : "",
    ``,
    lead.researchSummary ? `RESEARCH FOUND:\n${lead.researchSummary}` : "RESEARCH: No research was run for this lead.",
    ``,
    lead.emailSubject || lead.emailDraft ? [
      `EMAIL DRAFT WRITTEN:`,
      lead.emailSubject ? `Subject: ${lead.emailSubject}` : "",
      lead.emailDraft ? `\n${lead.emailDraft}` : "",
    ].filter(Boolean).join("\n") : "EMAIL: No draft has been generated yet.",
    ``,
    lead.linkedinNote ? `LINKEDIN MESSAGE WRITTEN:\n${lead.linkedinNote}` : "",
  ].filter(Boolean).join("\n");

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
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const reply = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
