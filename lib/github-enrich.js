// lib/github-enrich.js
//
// GitHub username lookup for gmail leads.
// Studio org names like "francisprovencher's Team" are often GitHub handles.
// GitHub profiles frequently list company, which lets us de-anonymize the lead.
//
// Usage:
//   import { enrichLeadsViaGitHub } from "@/lib/github-enrich";
//   const stats = await enrichLeadsViaGitHub(leadIds?, token?);

import { db } from "@/lib/db";
import { leads, accounts } from "@/lib/schema";
import { eq, inArray, isNull, sql } from "drizzle-orm";

const GITHUB_API = "https://api.github.com";

// ── Username extraction ───────────────────────────────────────────────────────

export function extractGitHubCandidates(studioOrg) {
  if (!studioOrg) return [];

  // Strip possessive workspace suffix: "Alice's Team", "Bob' Team", "AxleCode's Team"
  const base = studioOrg
    .replace(/[''’]s?\s+(Team|Org|Workspace|Studio|Account|Space)$/i, "")
    .trim();

  if (!base || base.length < 2) return [];

  const candidates = new Set();

  if (!base.includes(" ")) {
    // Single token — likely already a GitHub handle
    candidates.add(base);
    candidates.add(base.toLowerCase());
  } else {
    // Multi-word name — try common GitHub username patterns
    const words = base.split(/\s+/);
    candidates.add(words.join("-").toLowerCase());       // lok-gubhaju
    candidates.add(words.join("").toLowerCase());        // lokgubhaju
    candidates.add(words[0].toLowerCase());              // lok (first name only — low confidence)
  }

  // GitHub usernames: 1-39 chars, alphanumeric + hyphen, no leading/trailing hyphen
  return [...candidates].filter(c =>
    c.length >= 3 &&
    c.length <= 39 &&
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(c)
  );
}

// ── GitHub API call ───────────────────────────────────────────────────────────

async function fetchGitHubUser(username, token) {
  const headers = { "User-Agent": "Voyager1-Enrichment/1.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });

  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    throw new Error(`GitHub rate limited. Resets at ${reset ? new Date(Number(reset) * 1000).toISOString() : "unknown"}`);
  }
  if (!res.ok) return null;

  const d = await res.json();
  return {
    login: d.login,
    name: d.name?.trim() || null,
    company: d.company?.replace(/^@/, "").trim() || null,
    bio: d.bio?.trim() || null,
    location: d.location?.trim() || null,
    blog: d.blog?.trim() || null,
    email: d.email?.trim() || null,
    followers: d.followers ?? 0,
    publicRepos: d.public_repos ?? 0,
    avatarUrl: d.avatar_url || null,
  };
}

// ── Enrichment context builder ────────────────────────────────────────────────

function buildGitHubContext(ghUser) {
  const parts = [];
  if (ghUser.company) parts.push(`GitHub Co: ${ghUser.company}`);
  if (ghUser.location) parts.push(`Location: ${ghUser.location}`);
  if (ghUser.followers >= 50) parts.push(`GitHub: ${ghUser.followers} followers`);
  return parts.join(" · ");
}

// ── Main enrichment function ──────────────────────────────────────────────────

export async function enrichLeadsViaGitHub(leadIds = null, token = null) {
  const stats = { checked: 0, enriched: 0, alreadyDone: 0, noUsername: 0, notFound: 0, errors: [] };

  // Fetch target leads — gmail only, not already enriched, not deleted
  let targetLeads;
  if (leadIds?.length) {
    targetLeads = await db.query.leads.findMany({
      where: (l, { and, inArray, isNull }) => and(inArray(l.id, leadIds), isNull(l.deletedAt)),
      with: { account: true },
    });
  } else {
    targetLeads = await db.query.leads.findMany({
      where: (l, { and, or, like, isNull, not }) =>
        and(
          or(
            like(l.email, "%@gmail.com"),
            like(l.email, "%@yahoo.com"),
            like(l.email, "%@hotmail.com"),
            like(l.email, "%@outlook.com"),
            like(l.email, "%@icloud.com"),
          ),
          isNull(l.deletedAt),
          not(like(l.extraContext, "%GitHub:%")), // skip already enriched
        ),
      with: { account: true },
    });
  }

  const now = new Date().toISOString();

  for (const lead of targetLeads) {
    stats.checked++;

    // Skip if already enriched
    if (lead.extraContext?.includes("GitHub:")) {
      stats.alreadyDone++;
      continue;
    }

    // Extract studio org from extraContext
    const studioOrg = lead.extraContext?.match(/Studio Org:\s*([^·\n]+)/)?.[1]?.trim();
    const candidates = extractGitHubCandidates(studioOrg);

    if (candidates.length === 0) {
      stats.noUsername++;
      // Mark as checked so we don't retry every run
      await db.update(leads)
        .set({ extraContext: (lead.extraContext ? lead.extraContext + " · " : "") + "GitHub: no username", updatedAt: now })
        .where(eq(leads.id, lead.id));
      continue;
    }

    // Try each candidate username until one matches
    let ghUser = null;
    let matchedUsername = null;
    try {
      for (const username of candidates) {
        ghUser = await fetchGitHubUser(username, token);
        if (ghUser) { matchedUsername = username; break; }
        // Small delay between attempts to be polite
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      stats.errors.push({ leadId: lead.id, email: lead.email, error: err.message });
      if (err.message.includes("rate limited")) break; // stop entire run
      continue;
    }

    if (!ghUser) {
      stats.notFound++;
      await db.update(leads)
        .set({ extraContext: (lead.extraContext ? lead.extraContext + " · " : "") + "GitHub: not found", updatedAt: now })
        .where(eq(leads.id, lead.id));
      continue;
    }

    // Found a GitHub profile
    const ghContext = buildGitHubContext(ghUser);
    const newContext = [lead.extraContext, ghContext].filter(Boolean).join(" · ");

    const updates = { extraContext: newContext, updatedAt: now };

    // If GitHub returned a real name and the lead's stored name looks like a username, upgrade it
    if (ghUser.name && /^[a-z0-9_.-]+$/i.test(lead.name) && !lead.name.includes(" ")) {
      updates.name = ghUser.name;
    }

    await db.update(leads).set(updates).where(eq(leads.id, lead.id));

    // If GitHub returned a company, try to match/create an account and move the lead
    if (ghUser.company) {
      try {
        let account = await db.query.accounts.findFirst({
          where: (a, { eq }) => eq(a.company, ghUser.company),
        });
        if (!account) {
          [account] = await db.insert(accounts)
            .values({
              id: crypto.randomUUID(),
              createdAt: now,
              updatedAt: now,
              company: ghUser.company,
              accountNotes: `Identified via GitHub profile @${matchedUsername}`,
            })
            .returning();
        }
        // Move lead to correct company account
        await db.update(leads)
          .set({ accountId: account.id, updatedAt: now })
          .where(eq(leads.id, lead.id));
      } catch { /* non-fatal — enrichment still counts */ }
    }

    stats.enriched++;

    // Polite delay between users (GitHub recommends < 1 req/sec unauthenticated)
    await new Promise(r => setTimeout(r, token ? 100 : 800));
  }

  return stats;
}
