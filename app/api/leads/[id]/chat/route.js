import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { parseExtraContextForLLM } from "@/lib/parse-extra-context";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function POST(request, { params }) {
  const { id } = await params;
  const { messages, saveFinding } = await request.json();

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { account: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  // ── Save finding to account webResearch ────────────────────────────────────
  if (saveFinding) {
    if (!lead.account?.id) return NextResponse.json({ error: "No account found" }, { status: 400 });
    const existing = lead.account.webResearch ?? "";
    const separator = existing.trim() ? "\n" : "";
    const timestamp = new Date().toISOString().slice(0, 10);
    const appended = `${existing}${separator}\n[Added ${timestamp} via chat]\n${saveFinding}`;
    const [updated] = await db.update(accounts)
      .set({ webResearch: appended, updatedAt: new Date().toISOString() })
      .where(eq(accounts.id, lead.account.id))
      .returning();
    return NextResponse.json({ saved: true, account: updated });
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  const productSignals = parseExtraContextForLLM(lead.extraContext);

  const systemPrompt = [
    `You are a B2B sales assistant at Apollo GraphQL. You previously researched a prospect and wrote a sales email draft. The sales rep is now asking you questions about your reasoning, the research you found, and the choices you made in the email.`,
    ``,
    `You have access to a web search tool. Use it when the rep asks you to verify a claim, find specific information about the company, or answer a question that requires current data you don't already have. Do not search for things already covered in the research below.`,
    ``,
    `IMPORTANT: The product usage signals below come directly from the GraphOS platform database — they are hard facts about what this account is actually doing, not inferences. When the rep asks what data you have, describe these signals specifically and accurately.`,
    ``,
    `FORMATTING RULE: If you perform a web search to answer this question, end your response with a blank line followed by:`,
    `FINDING: [one concise bullet starting with •, including a source citation in brackets, e.g. • Company X migrated to microservices in 2024 [source.com]]`,
    `Only include a FINDING block when you actually searched the web. Never include it for reasoning about existing context.`,
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
    // First call — with web search tool available
    const firstRes = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: systemPrompt,
        messages,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!firstRes.ok) throw new Error(`Anthropic API error ${firstRes.status}: ${await firstRes.text()}`);
    let data = await firstRes.json();

    // If Claude used web search, do a second call with the results
    const searchWasUsed = data.stop_reason === "tool_use";
    if (searchWasUsed) {
      const toolResults = data.content
        .filter(b => b.type === "tool_use")
        .map(b => ({
          type: "tool_result",
          tool_use_id: b.id,
          content: b.content ? JSON.stringify(b.content) : "No results",
        }));

      const secondRes = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: systemPrompt,
          messages: [
            ...messages,
            { role: "assistant", content: data.content },
            { role: "user", content: toolResults },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!secondRes.ok) throw new Error(`Anthropic API error ${secondRes.status}: ${await secondRes.text()}`);
      data = await secondRes.json();
    }

    const fullText = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";

    // Parse out the FINDING block if present
    const findingMatch = fullText.match(/\nFINDING:\s*(.+?)$/s);
    const finding = findingMatch ? findingMatch[1].trim() : null;
    const reply = finding
      ? fullText.slice(0, fullText.lastIndexOf("\nFINDING:")).trim()
      : fullText.trim();

    return NextResponse.json({
      reply,
      ...(finding && { finding, canSave: true }),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
