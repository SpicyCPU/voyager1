import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { maybeAutoTrack } from "@/lib/auto-track";

export async function GET(request, { params }) {
  const { id } = await params;
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { account: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const {
    name, title, email, linkedinUrl, visitedUrls, extraContext, signalType,
    emailSubject, emailDraft, linkedinNote, outreachStatus, notes,
  } = body;

  const updates = { updatedAt: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (title !== undefined) updates.title = title;
  if (email !== undefined) updates.email = email;
  if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl;
  if (visitedUrls !== undefined) updates.visitedUrls = visitedUrls;
  if (extraContext !== undefined) updates.extraContext = extraContext;
  if (signalType !== undefined) updates.signalType = signalType;
  if (emailSubject !== undefined) updates.emailSubject = emailSubject;
  if (emailDraft !== undefined) updates.emailDraft = emailDraft;
  if (linkedinNote !== undefined) updates.linkedinNote = linkedinNote;
  if (outreachStatus !== undefined) updates.outreachStatus = outreachStatus;
  if (notes !== undefined) updates.notes = notes;

  const [updated] = await db.update(leads).set(updates).where(eq(leads.id, id)).returning();
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, updated.accountId) });

  // Auto-track: if rep marks this lead as replied, the account is worth tracking
  if (outreachStatus === "replied") {
    maybeAutoTrack(updated.accountId, "auto_reply").catch(() => {});
  }

  return NextResponse.json({ lead: { ...updated, account } });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const now = new Date().toISOString();
  await db.update(leads)
    .set({ deletedAt: now, deleteReason: "manual", updatedAt: now })
    .where(eq(leads.id, id));
  return NextResponse.json({ ok: true });
}
