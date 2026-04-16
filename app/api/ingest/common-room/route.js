import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, leads } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

// Common Room webhook receiver
//
// Auth: x-commonroom-webhook-secret header (static secret, not HMAC-signed)
// Set the same INGEST_SECRET value in Common Room's webhook settings.
//
// Payload types handled:
//   contact  — identified person with org context
//   activity — action event (web visit, GitHub, Slack, etc.) — member may be empty (anonymous)
//   org      — anonymous org-level signal (no person)
//
// Signal type mapping:
//   CR trigger / serviceName               → signalType stored in Lead
//   ──────────────────────────────────────────────────────────────────
//   contact visits website                 → web_visit
//   serviceName contains "GitHub"          → github_download
//   serviceName contains "webinar"/"Zoom"  → webinar
//   anything else (Slack join, etc.)       → other
//
// Dedup: find any existing Lead with matching email (any outreachStatus).
//   If found → append signal to signalHistory, update lastSignalAt.
//              Re-engagement (outreachStatus=sent) gets context appended — not a new lead.
//   If not found → create new lead.
//
// Anonymous org visits (no email, no name): logged and skipped.
// A future de-anonymization spike can cross-reference these (see TODOS.md).

export async function POST(request) {
  // 1. Auth
  const secret = process.env.INGEST_SECRET;
  const incoming = request.headers.get("x-commonroom-webhook-secret") ?? "";
  if (!secret || incoming !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { payload, id: webhookId, source } = body;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  // 3. Detect payload type and extract fields
  const mapped = mapPayload(payload, source);

  // Anonymous org visit — no person to draft outreach to. Skip lead creation.
  // Log for future de-anonymization research (see TODOS.md).
  if (!mapped.name || !mapped.email) {
    console.info("[common-room] anonymous signal skipped", {
      webhookId,
      company: mapped.company,
      signalType: mapped.signalType,
      visitedUrl: mapped.visitedUrl,
    });
    return NextResponse.json({
      action: "skipped",
      reason: "anonymous — no identifiable person",
      company: mapped.company,
    });
  }

  if (!mapped.company) {
    return NextResponse.json({ error: "Could not determine company from payload" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // 4. Upsert account
  let account = await db.query.accounts.findFirst({
    where: eq(accounts.company, mapped.company.trim()),
  });
  if (!account) {
    [account] = await db.insert(accounts)
      .values({
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        company: mapped.company.trim(),
        headcount: mapped.headcount ?? null,
        hq: mapped.hq ?? null,
      })
      .returning();
  } else if (mapped.headcount || mapped.hq) {
    // Backfill missing enrichment on existing accounts
    const updates = { updatedAt: now };
    if (mapped.headcount && !account.headcount) updates.headcount = mapped.headcount;
    if (mapped.hq && !account.hq) updates.hq = mapped.hq;
    if (Object.keys(updates).length > 1) {
      [account] = await db.update(accounts)
        .set(updates)
        .where(eq(accounts.id, account.id))
        .returning();
    }
  }

  // 5. Build new signal entry for history
  const newSignal = {
    type: mapped.signalType,
    url: mapped.visitedUrl ?? null,
    source: "common_room",
    timestamp: now,
    webhookId: webhookId ?? null,
  };

  // 6. Dedup: find any existing lead with this email (regardless of status or age)
  const existing = await db.query.leads.findFirst({
    where: and(eq(leads.email, mapped.email), eq(leads.accountId, account.id)),
  });

  if (existing) {
    // Append signal to existing lead — handles both in-queue and re-engagement cases
    const history = parseHistory(existing.signalHistory);
    history.push(newSignal);

    // Build enriched extraContext: summarise re-engagement if previously sent
    let extraContext = existing.extraContext ?? "";
    if (existing.outreachStatus === "sent" && mapped.visitedUrl) {
      const reEngagementNote = `[Re-engagement ${now.slice(0, 10)}] ${mapped.signalType}: ${mapped.visitedUrl}`;
      extraContext = extraContext ? `${extraContext}\n${reEngagementNote}` : reEngagementNote;
    } else if (mapped.visitedUrl && !extraContext.includes(mapped.visitedUrl)) {
      extraContext = extraContext ? `${extraContext}\n${mapped.visitedUrl}` : mapped.visitedUrl;
    }

    const [updated] = await db.update(leads)
      .set({
        signalHistory: JSON.stringify(history),
        lastSignalAt: now,
        extraContext,
        updatedAt: now,
        // Boost draftStatus back to idle if it was "done" and we're re-engaging
        // so rep can regenerate with fresh context (only if already sent)
        ...(existing.outreachStatus === "sent" ? { draftStatus: "idle" } : {}),
      })
      .where(eq(leads.id, existing.id))
      .returning();

    return NextResponse.json({
      action: "updated",
      lead: { ...updated, account },
      account,
      signalAppended: newSignal,
    });
  }

  // 7. Create new lead
  const [lead] = await db.insert(leads)
    .values({
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      accountId: account.id,
      name: mapped.name,
      title: mapped.title ?? null,
      email: mapped.email,
      linkedinUrl: mapped.linkedinUrl ?? null,
      visitedUrls: mapped.visitedUrl ?? null,
      extraContext: mapped.extraContext ?? null,
      signalType: mapped.signalType,
      signalHistory: JSON.stringify([newSignal]),
      lastSignalAt: now,
    })
    .returning();

  return NextResponse.json({ action: "created", lead: { ...lead, account }, account }, { status: 201 });
}

// ─── Payload mapper ───────────────────────────────────────────────────────────

function mapPayload(payload, source) {
  // Activity payload: has activityType + serviceName + member + company fields
  if (payload.activityType || payload.serviceName) {
    const org = payload.member?.organization ?? {};
    return {
      name: payload.member?.fullName ?? null,
      email: payload.member?.primaryEmail ?? payload.member?.professionalEmail ?? null,
      title: payload.member?.title ?? null,
      linkedinUrl: payload.member?.linkedInUrl ?? null,
      company: payload.company?.name ?? org.name ?? null,
      visitedUrl: payload.externalActivityUrl ?? payload.member?.lastSeenWebVisitUrl ?? null,
      signalType: mapSignalType(payload.serviceName, source?.name),
      extraContext: payload.content ?? null,
      headcount: payload.company?.employeeCount ?? org.employeeCount ?? null,
      hq: payload.company?.location ?? payload.company?.country ?? org.location ?? org.country ?? null,
    };
  }

  // Contact payload: has fullName, primaryEmail, organization fields
  if (payload.fullName || payload.primaryEmail) {
    const org = payload.organization ?? {};
    return {
      name: payload.fullName ?? null,
      email: payload.primaryEmail ?? payload.professionalEmail ?? null,
      title: payload.title ?? null,
      linkedinUrl: payload.linkedInUrl ?? null,
      company: org.name ?? null,
      visitedUrl: payload.lastSeenWebVisitUrl ?? null,
      signalType: payload.lastSeenWebVisitUrl ? "web_visit" : "other",
      extraContext: null,
      headcount: org.employeeCount ?? null,
      hq: org.location ?? org.country ?? null,
    };
  }

  // Org payload: has name + domain (no person)
  if (payload.domain || (payload.name && !payload.fullName)) {
    return {
      name: null,
      email: null,
      title: null,
      linkedinUrl: null,
      company: payload.name ?? null,
      visitedUrl: payload.lastSeenWebVisitUrl ?? null,
      signalType: "web_visit",
      extraContext: null,
      headcount: payload.employeeCount ?? null,
      hq: payload.location ?? payload.country ?? null,
    };
  }

  // Unknown payload type — return empty to trigger anonymous skip path
  console.warn("[common-room] unknown payload shape — skipping", { keys: Object.keys(payload) });
  return { name: null, email: null, company: null, signalType: "other" };
}

function mapSignalType(serviceName, workflowName) {
  const s = (serviceName ?? "").toLowerCase();
  const w = (workflowName ?? "").toLowerCase();
  if (s.includes("github")) return "github_download";
  if (s.includes("webinar") || s.includes("zoom") || w.includes("webinar")) return "webinar";
  if (s.includes("web") || s.includes("website") || s.includes("visit")) return "web_visit";
  if (s.includes("job") || w.includes("job")) return "job_posting";
  return "other";
}

function parseHistory(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
