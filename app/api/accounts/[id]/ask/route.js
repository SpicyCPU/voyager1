import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";

// POST /api/accounts/[id]/ask
//
// Runs a targeted research question about a specific account.
// Uses web search to answer. Returns plain text — not saved automatically.
// The UI offers an "Add to notes" button to persist if useful.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function POST(request, { params }) {
  const { id } = await params;
  const { question } = await request.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, id) });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  const context = [
    account.webResearch   ? `WEB RESEARCH:\n${account.webResearch}` : "",
    account.edgarData     ? `FINANCIAL / EARNINGS:\n${account.edgarData}` : "",
    account.jobSignals    ? `JOB SIGNALS:\n${account.jobSignals}` : "",
    account.accountNotes  ? `ACCOUNT NOTES:\n${account.accountNotes}` : "",
    account.crEnrichment  ? `COMMON ROOM:\n${account.crEnrichment}` : "",
    account.sfContext     ? `SALESFORCE:\n${account.sfContext}` : "",
  ].filter(Boolean).join("\n\n");

  const prompt = `You are a B2B sales researcher at Apollo GraphQL. Answer the following question about "${account.company}" as specifically and concisely as possible. Search the web if needed to find current information.

${APOLLO_PRODUCT_CONTEXT}

${context ? `EXISTING RESEARCH ON THIS ACCOUNT:\n${context}\n` : ""}
QUESTION: ${question.trim()}

Return your answer directly — no preamble, no "I'll search for", no "Based on my research". Be specific and factual. 2-5 sentences or a short bullet list, whichever fits best.`;

  try {
    const answer = await callClaudeWithSearch(apiKey, [{ role: "user", content: prompt }]);
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
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
      msgs = [...msgs, { role: "assistant", content: data.content }];
      const toolResults = data.content
        .filter(b => b.type === "tool_use")
        .map(b => ({ type: "tool_result", tool_use_id: b.id, content: b.content ? JSON.stringify(b.content) : "No results" }));
      msgs = [...msgs, { role: "user", content: toolResults }];
      continue;
    }

    return data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
  }
  throw new Error("Research timed out");
}
