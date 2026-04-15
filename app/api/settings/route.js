import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const RULES_CAP = null;         // No hard cap
export const RULES_WARN_AT = 20;       // Soft warning shown in Settings UI

export const DEFAULT_RULES = [
  "Never use em dashes, en dashes, or hyphens in the email body",
  "No hollow phrases: 'hope this finds you well', 'reaching out', 'touch base', 'synergy', 'I wanted to'",
  "Reference 1-2 specific signals — make it obvious you did your homework, never be vague",
  "Email subject: 6 words max, no clickbait, no questions",
  "LinkedIn message: 3 sentences max",
  "Write like a human — conversational, specific, never templated or corporate",
  "Reference 1-2 similar Apollo customers by name to build credibility",
  "Tie research directly to a specific GraphOS or Apollo feature to avoid a vague CTA",
  "Place customer reference after a pain point, not as an opener with 'we work with'",
  "Clear, specific CTA — demonstrate Apollo value before asking for meeting time",
  "For large enterprises, ensure research is relevant to their specific division or team",
  "Open with an observation or insight, not a compliment or introduction",
];

async function getOrSeedSettings() {
  let row = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, "default"),
  });

  if (!row) {
    const now = new Date().toISOString();
    [row] = await db.insert(appSettings)
      .values({ id: "default", rules: JSON.stringify(DEFAULT_RULES), updatedAt: now })
      .returning();
  }

  return row;
}

export async function GET() {
  const row = await getOrSeedSettings();
  const rules = row.rules ? JSON.parse(row.rules) : DEFAULT_RULES;
  return NextResponse.json({ rules, warnAt: RULES_WARN_AT });
}

export async function PUT(request) {
  const { rules } = await request.json();
  if (!Array.isArray(rules)) return NextResponse.json({ error: "rules must be an array" }, { status: 400 });

  const now = new Date().toISOString();

  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  let row;
  if (existing) {
    [row] = await db.update(appSettings)
      .set({ rules: JSON.stringify(rules), updatedAt: now })
      .where(eq(appSettings.id, "default"))
      .returning();
  } else {
    [row] = await db.insert(appSettings)
      .values({ id: "default", rules: JSON.stringify(rules), updatedAt: now })
      .returning();
  }

  return NextResponse.json({ rules: JSON.parse(row.rules), warnAt: RULES_WARN_AT });
}
