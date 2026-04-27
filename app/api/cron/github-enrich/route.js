import { NextResponse } from "next/server";
import { enrichLeadsViaGitHub } from "@/lib/github-enrich";

// Runs daily at 2pm ET (Mon-Fri), 1hr after Omni sync.
// Picks up any new personal-email leads from that day's delivery.

export const maxDuration = 300;

export async function GET(request) {
  // Vercel cron auth
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN ?? null;
  console.log(`[cron/github-enrich] starting, token: ${githubToken ? "yes" : "no"}`);

  const stats = await enrichLeadsViaGitHub(null, githubToken);
  console.log("[cron/github-enrich]", stats);

  return NextResponse.json(stats);
}
