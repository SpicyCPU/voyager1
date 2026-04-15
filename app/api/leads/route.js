import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { checkLeadCountThreshold } from "@/lib/auto-track";

export async function POST(request) {
  const body = await request.json();
  const {
    company,
    name,
    title,
    email,
    linkedinUrl,
    visitedUrls,
    extraContext,
    signalType = "manual_entry",
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!company?.trim()) return NextResponse.json({ error: "company is required" }, { status: 400 });

  const now = new Date().toISOString();

  // Upsert account
  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.company, company.trim()),
  });

  let account;
  if (existing) {
    account = existing;
  } else {
    [account] = await db.insert(accounts)
      .values({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, company: company.trim() })
      .returning();
  }

  const [lead] = await db.insert(leads)
    .values({
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      accountId: account.id,
      name: name.trim(),
      title,
      email,
      linkedinUrl,
      visitedUrls,
      extraContext,
      signalType,
    })
    .returning();

  // Auto-track if account now has 3+ leads
  checkLeadCountThreshold(account.id).catch(() => {});

  return NextResponse.json({ lead: { ...lead, account } }, { status: 201 });
}
