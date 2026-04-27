import { NextResponse } from "next/server";
import { enrichLeadsViaGitHub } from "@/lib/github-enrich";

// POST /api/ingest/github-enrich?token=INGEST_SECRET
//
// Runs GitHub username lookup on personal-email leads that haven't been
// enriched yet. Safe to call multiple times — skips already-checked leads.
//
// Optional body: { "leadIds": ["id1", "id2"] } to target specific leads.
// Without a body, processes all un-enriched personal-email leads.
//
// Set GITHUB_TOKEN env var for 5000 req/hr instead of 60 req/hr.
// Without it, enrichment rate-limits at ~60 leads/hr (still useful for daily runs).
//
// Vercel max duration: 300s (Pro). Large backfills should be run in batches.

export const maxDuration = 300;

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const secret = process.env.INGEST_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let leadIds = null;
  try {
    const body = await request.json().catch(() => null);
    if (body?.leadIds?.length) leadIds = body.leadIds;
  } catch { /* no body — enrich all */ }

  const githubToken = process.env.GITHUB_TOKEN ?? null;

  console.log(`[github-enrich] starting — ${leadIds ? leadIds.length + " specific leads" : "all un-enriched personal-email leads"}, github token: ${githubToken ? "yes" : "no (60 req/hr limit)"}`);

  const stats = await enrichLeadsViaGitHub(leadIds, githubToken);

  console.log("[github-enrich] done:", stats);
  return NextResponse.json(stats);
}
