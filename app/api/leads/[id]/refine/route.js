import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, refinementExamples } from "@/lib/schema";
import { eq } from "drizzle-orm";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function POST(request, { params }) {
  const { id } = await params;
  const { field, feedback, currentText } = await request.json();

  if (!["emailDraft", "linkedinNote"].includes(field)) {
    return NextResponse.json({ error: "field must be emailDraft or linkedinNote" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Here is the current ${field === "emailDraft" ? "email body" : "LinkedIn message"}:\n\n${currentText}\n\nUser feedback: ${feedback}\n\nRewrite it applying the feedback exactly. Return only the rewritten text — no preamble, no explanation.`,
      }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Anthropic error: ${err}` }, { status: 500 });
  }

  const data = await res.json();
  const updatedText = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";

  // Save before/after example for future few-shot injection — fire and forget
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

  await db.update(leads)
    .set({ [field]: updatedText, updatedAt: now })
    .where(eq(leads.id, id));

  return NextResponse.json({ updatedText });
}
