import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/schema";
import { eq, isNull, or, and, inArray } from "drizzle-orm";

const PRIORITY = {
  webinar: 0,
  web_visit: 1,
  job_posting: 2,
  customer_expansion: 3,
  github_download: 4,
  platform_signup: 5,
  other: 6,
  manual_entry: 7,
};

export async function GET() {
  // Include idle + done leads so ingest-created leads appear immediately.
  // Idle leads auto-trigger generation when opened in ReviewMode.
  const rows = await db.query.leads.findMany({
    where: (l, { and, eq, or, isNull, inArray }) =>
      and(
        isNull(l.deletedAt),
        inArray(l.draftStatus, ["idle", "done", "error"]),
        or(eq(l.outreachStatus, "draft"), isNull(l.outreachStatus))
      ),
    with: { account: true },
  });

  const RECENCY_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours — see TODOS.md for tuning
  const now = Date.now();

  const DRAFT_ORDER = { done: 0, error: 1, idle: 2 };

  rows.sort((a, b) => {
    // Done drafts always before idle (ready to send beats ready to generate)
    const da = DRAFT_ORDER[a.draftStatus] ?? 3;
    const db_ = DRAFT_ORDER[b.draftStatus] ?? 3;
    if (da !== db_) return da - db_;

    // Recency boost: a lead with a signal in the last 48h sorts above same-priority leads
    const aRecent = a.lastSignalAt && (now - new Date(a.lastSignalAt).getTime()) < RECENCY_WINDOW_MS;
    const bRecent = b.lastSignalAt && (now - new Date(b.lastSignalAt).getTime()) < RECENCY_WINDOW_MS;
    if (aRecent !== bRecent) return aRecent ? -1 : 1;

    // Within same recency group: signal type priority
    const pa = PRIORITY[a.signalType] ?? 6;
    const pb = PRIORITY[b.signalType] ?? 6;
    if (pa !== pb) return pa - pb;

    // Within same priority: most recently active first (lastSignalAt > createdAt fallback)
    const aTime = a.lastSignalAt ?? a.createdAt;
    const bTime = b.lastSignalAt ?? b.createdAt;
    return aTime < bTime ? 1 : -1;
  });

  const accountsMap = {};
  rows.forEach(l => { if (l.account) accountsMap[l.account.id] = l.account; });

  return NextResponse.json({
    leads: rows,
    total: rows.length,
    accounts: Object.values(accountsMap),
  });
}
