import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const RULES_WARN_AT = 20;

export const DEFAULT_RULES = [
  "NEVER use any dashes anywhere: no em dash (—), no en dash (–), no hyphen (-) used as punctuation. Rewrite the sentence instead. This is the single most important rule.",
  "No hollow phrases: 'hope this finds you well', 'reaching out', 'touch base', 'synergy', 'I wanted to', 'I am writing to'",
  "Reference 1-2 specific signals. Make it obvious you did your homework. Never be vague.",
  "Email subject: 6 words max, no clickbait, no questions",
  "LinkedIn message: 3 sentences max",
  "Write like a human. Conversational, specific, never templated or corporate.",
  "Reference 1-2 similar Apollo customers by name to build credibility",
  "Tie research directly to a specific GraphOS or Apollo feature to avoid a vague CTA",
  "Place customer reference after a pain point, not as an opener with 'we work with'",
  "Clear, specific CTA. Demonstrate Apollo value before asking for meeting time.",
  "For large enterprises, ensure research is relevant to their specific division or team",
  "Open with an observation or insight, not a compliment or introduction",
];

export const DEFAULT_EMAIL_STRATEGY = `Goal: book a 20-minute intro call. One specific hook, one clear ask.

These leads signed up for GraphOS — they have real intent. The email should feel like you understand their specific situation, not like a mass outreach template. Earn the conversation by demonstrating you did your homework.`;

export const DEFAULT_RESEARCH_FOCUS = `Priority signals to find:
- Engineering blog posts, conference talks, or public architecture discussions
- Job postings mentioning GraphQL, API platform, federation, or microservices
- Recent funding, acquisitions, or leadership hires (signals of growth/change)
- Earnings call quotes about API strategy, developer platform, or digital transformation
- Public GitHub repos or tech stack mentions

Avoid: generic company descriptions, marketing copy, product announcements unrelated to their engineering org.`;

async function getOrSeedSettings() {
  let row = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  if (!row) {
    const now = new Date().toISOString();
    [row] = await db.insert(appSettings).values({
      id: "default",
      rules: JSON.stringify(DEFAULT_RULES),
      emailStrategy: DEFAULT_EMAIL_STRATEGY,
      researchFocus: DEFAULT_RESEARCH_FOCUS,
      updatedAt: now,
    }).returning();
  }
  return row;
}

export async function GET() {
  const row = await getOrSeedSettings();
  return NextResponse.json({
    rules: row.rules ? JSON.parse(row.rules) : DEFAULT_RULES,
    emailStrategy: row.emailStrategy ?? DEFAULT_EMAIL_STRATEGY,
    researchFocus: row.researchFocus ?? DEFAULT_RESEARCH_FOCUS,
    warnAt: RULES_WARN_AT,
  });
}

export async function PUT(request) {
  const body = await request.json();
  const now = new Date().toISOString();

  const updates = {};
  if (Array.isArray(body.rules)) updates.rules = JSON.stringify(body.rules);
  if (typeof body.emailStrategy === "string") updates.emailStrategy = body.emailStrategy;
  if (typeof body.researchFocus === "string") updates.researchFocus = body.researchFocus;

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.updatedAt = now;
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") });
  let row;
  if (existing) {
    [row] = await db.update(appSettings).set(updates).where(eq(appSettings.id, "default")).returning();
  } else {
    [row] = await db.insert(appSettings).values({ id: "default", ...updates }).returning();
  }

  return NextResponse.json({
    rules: row.rules ? JSON.parse(row.rules) : DEFAULT_RULES,
    emailStrategy: row.emailStrategy ?? DEFAULT_EMAIL_STRATEGY,
    researchFocus: row.researchFocus ?? DEFAULT_RESEARCH_FOCUS,
    warnAt: RULES_WARN_AT,
  });
}
