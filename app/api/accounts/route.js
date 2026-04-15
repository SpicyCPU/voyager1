import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const trackedOnly = searchParams.get("tracked") === "true";
  const untrackedOnly = searchParams.get("tracked") === "false";

  const rows = await db.query.accounts.findMany({
    orderBy: [desc(accounts.updatedAt)],
    with: {
      leads: {
        where: (l, { isNull }) => isNull(l.deletedAt),
        orderBy: [desc(leads.updatedAt)],
        columns: { id: true, updatedAt: true, outreachStatus: true, signalType: true },
      },
    },
  });

  // Filter by tracked status if requested
  let filtered = rows;
  if (trackedOnly) filtered = rows.filter(a => a.tracked === "1");
  if (untrackedOnly) filtered = rows.filter(a => a.tracked !== "1");

  // Compute a recommendation score for untracked accounts
  // Score inputs: lead count, signal quality, recency, has research
  // This is a heuristic stub — future: replace with Claude scoring
  const normalize = filtered.map(acc => {
    const leadCount = acc.leads.length;
    const hasReply = acc.leads.some(l => l.outreachStatus === "replied");
    const hasSent = acc.leads.some(l => l.outreachStatus === "sent");
    const hasResearch = Boolean(acc.webResearch);
    const highValueSignal = acc.leads.some(l =>
      ["platform_signup", "github_download", "web_visit"].includes(l.signalType)
    );
    const recencyScore = acc.leads[0]?.updatedAt
      ? Math.max(0, 1 - (Date.now() - new Date(acc.leads[0].updatedAt).getTime()) / (30 * 86400000))
      : 0;

    const score =
      (leadCount >= 3 ? 3 : leadCount) +
      (hasReply ? 5 : 0) +
      (hasSent ? 2 : 0) +
      (hasResearch ? 1 : 0) +
      (highValueSignal ? 2 : 0) +
      recencyScore;

    return {
      ...acc,
      _count: { leads: leadCount },
      _score: acc.tracked === "1" ? null : Math.round(score * 10) / 10,
      _recommended: acc.tracked !== "1" && score >= 5,
    };
  });

  return NextResponse.json({ accounts: normalize });
}

export async function POST(request) {
  const body = await request.json();
  const { company, webResearch, edgarData, driveData, jobSignals, accountNotes } = body;

  if (!company?.trim()) {
    return NextResponse.json({ error: "company is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.company, company.trim()),
  });

  let account;
  if (existing) {
    [account] = await db.update(accounts)
      .set({ webResearch, edgarData, driveData, jobSignals, accountNotes, updatedAt: now })
      .where(eq(accounts.company, company.trim()))
      .returning();
  } else {
    [account] = await db.insert(accounts)
      .values({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        company: company.trim(),
        webResearch,
        edgarData,
        driveData,
        jobSignals,
        accountNotes,
      })
      .returning();
  }

  return NextResponse.json({ account }, { status: 201 });
}
