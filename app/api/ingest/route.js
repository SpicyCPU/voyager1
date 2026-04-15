import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq } from "drizzle-orm";

// Phase 1: validates the contract for Phase 2 webhook integrations.
// Callers must send: Authorization: Bearer <INGEST_SECRET>

export async function POST(request) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.INGEST_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { company, lead_data, source_type = "other", metadata = {} } = body;

  if (!company?.trim()) {
    return NextResponse.json({ error: "company is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
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

  let lead = null;
  if (lead_data?.name) {
    [lead] = await db.insert(leads)
      .values({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        accountId: account.id,
        name: lead_data.name,
        title: lead_data.title ?? null,
        email: lead_data.email ?? null,
        linkedinUrl: lead_data.linkedin_url ?? null,
        visitedUrls: lead_data.visited_urls ?? null,
        extraContext: lead_data.extra_context ?? null,
        signalType: source_type,
        notes: metadata ? JSON.stringify(metadata) : null,
      })
      .returning();
  }

  return NextResponse.json({ account, lead }, { status: 201 });
}
