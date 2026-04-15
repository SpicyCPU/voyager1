// lib/auto-track.js
//
// Auto-tracking rules for accounts.
// Called after any event that might push an account over a tracking threshold.
//
// Rules:
//   auto_reply  — any lead from this account has been marked "replied"
//   auto_leads  — account has accumulated 3+ leads

import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq, count } from "drizzle-orm";

export async function maybeAutoTrack(accountId, reason) {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  // Already tracked — nothing to do
  if (!account || account.tracked === "1") return;

  const now = new Date().toISOString();
  await db.update(accounts)
    .set({ tracked: "1", trackedAt: now, trackReason: reason, updatedAt: now })
    .where(eq(accounts.id, accountId));
}

// Check lead count threshold (3+) for an account
export async function checkLeadCountThreshold(accountId) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.accountId, accountId));

  if (value >= 3) {
    await maybeAutoTrack(accountId, "auto_leads");
  }
}
