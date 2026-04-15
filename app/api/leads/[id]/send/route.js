import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(request, { params }) {
  const { id } = await params;
  const now = new Date().toISOString();

  const [updated] = await db.update(leads)
    .set({ outreachStatus: "sent", sentAt: now, updatedAt: now })
    .where(eq(leads.id, id))
    .returning();

  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, updated.accountId) });

  // Log to Google Sheet via Apps Script webhook (server-side only — WEBHOOK_URL never sent to browser)
  const webhookUrl = process.env.WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.name,
        company: account?.company ?? "",
        email: updated.email ?? "",
        sentAt: now,
      }),
    }).catch(err => console.error("Sheet webhook failed:", err));
  }

  return NextResponse.json({ lead: { ...updated, account } });
}
