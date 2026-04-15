import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_RULES } from "../route";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function POST(request) {
  const { feedback, currentText, field } = await request.json();
  if (!feedback?.trim()) {
    return NextResponse.json({ error: "feedback is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  // Load current rules
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  const existingRules = row?.rules ? JSON.parse(row.rules) : DEFAULT_RULES;

  const prompt = `You are helping a B2B sales rep at Apollo GraphQL build a set of writing rules for AI-generated outreach emails.

The rep just gave this feedback to refine a draft:
"${feedback}"

${currentText ? `The draft being refined was:\n${currentText}\n` : ""}

Their existing rules (do NOT duplicate these):
${existingRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Your task: distill the rep's feedback into a single concise writing rule (one sentence, 15 words max). The rule should be:
- General (applies to all emails, not just this one)
- Actionable (tells Claude what to do or avoid)
- Non-redundant with existing rules above

First check: does this feedback overlap significantly with an existing rule?

Respond with ONLY valid JSON in this exact shape:
{"rule":"...","isDuplicate":true/false,"duplicateOf":null_or_rule_text}

If the feedback is too specific to this one email (e.g. "make this paragraph shorter") and wouldn't make a useful general rule, set rule to null.`;

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Anthropic error ${res.status}: ${err}` }, { status: 500 });
  }

  const data = await res.json();
  const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON");
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({
      suggested: parsed.rule ?? null,
      isDuplicate: parsed.isDuplicate ?? false,
      duplicateOf: parsed.duplicateOf ?? null,
      currentCount: existingRules.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse suggestion" }, { status: 500 });
  }
}
