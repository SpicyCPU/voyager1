import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq, desc, and, ne } from "drizzle-orm";

export async function GET(request, { params }) {
  const { id } = await params;
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: {
      leads: {
        where: (l, { isNull }) => isNull(l.deletedAt),
        orderBy: [desc(leads.createdAt)],
      },
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account, leads: account.leads });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const {
    company, webResearch, edgarData, driveData, jobSignals, accountNotes,
    crEnrichment, sfContext,
    tracked, trackReason, sourcedVia, vendorDomains,
  } = body;

  const now = new Date().toISOString();
  const updates = { updatedAt: now };

  // Company rename — check uniqueness against other accounts
  if (company !== undefined) {
    const trimmed = company.trim();
    if (!trimmed) return NextResponse.json({ error: "Company name cannot be empty" }, { status: 400 });
    const conflict = await db.query.accounts.findFirst({
      where: and(eq(accounts.company, trimmed), ne(accounts.id, id)),
    });
    if (conflict) return NextResponse.json({ error: `An account named "${trimmed}" already exists` }, { status: 409 });
    updates.company = trimmed;
  }

  if (webResearch !== undefined) updates.webResearch = webResearch;
  if (edgarData !== undefined) updates.edgarData = edgarData;
  if (driveData !== undefined) updates.driveData = driveData;
  if (jobSignals !== undefined) updates.jobSignals = jobSignals;
  if (accountNotes !== undefined) updates.accountNotes = accountNotes;
  if (sourcedVia !== undefined) updates.sourcedVia = sourcedVia;
  if (vendorDomains !== undefined) updates.vendorDomains = vendorDomains;
  if (crEnrichment !== undefined) updates.crEnrichment = crEnrichment;
  if (sfContext !== undefined) updates.sfContext = sfContext;
  if (tracked !== undefined) {
    updates.tracked = tracked ? "1" : "0";
    updates.trackedAt = tracked ? now : null;
    updates.trackReason = tracked ? (trackReason ?? "manual") : null;
  }

  const [account] = await db.update(accounts)
    .set(updates)
    .where(eq(accounts.id, id))
    .returning();

  return NextResponse.json({ account });
}
