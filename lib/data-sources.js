// lib/data-sources.js
//
// Single source of truth for every system that feeds Voyager 1.
// Three categories:
//   ingest    — create or update leads (people enter the queue from here)
//   research  — Claude searches these during account research generation
//   enrichment — add context to existing leads and accounts
//
// Statuses:
//   live                — connected and flowing
//   wired_not_connected — route/auth built, not yet enabled in the source system
//   partial             — connected but limited (e.g. missing fields, no recency filter)
//   planned             — designed but not yet built
//   deprecated          — was live, replaced by a newer integration

export const DATA_SOURCES = [

  // ─── INGEST SOURCES ──────────────────────────────────────────────────────────

  {
    id: "omni_webhook",
    category: "ingest",
    name: "Omni — Studio Sign-ups (Webhook)",
    status: "live",
    delivery: "Omni scheduled delivery → POST /api/ingest/omni-webhook?token=INGEST_SECRET",
    schedule: "Daily at 1pm ET (weekdays). Manual trigger: Send now in Omni delivery settings.",
    fields: [
      "Email",
      "Full Name",
      "Studio Organization Name",
      "Account Name",
      "Subscription Tier",
      "Is Using Router",
      "Total Federated Graphs",
      "Total Unique Subgraphs",
      "Total Active Users Last 30 Days",
      "Requests Last 30 Days",
      "Has Router Operations Last 7days",
      "Is Using Schema Checks",
      "Is Using Connectors",
      "Proposals Created Count Last30d",
      "Persisted Queries Operation Count Last30d",
      "Last Explorer Query Run Date",
      "Created At Date",
      "Last Seen At",
    ],
    filters: "Net-new only — skips any email already in DB (active or soft-deleted). Respects manually curated DB state. Format: CSV (set in Omni Chart tab).",
    notes: "Sends all plan types including Gmail signups. Studio Org name shown on triage cards. Paid-org detection: if another member of the same Studio Org is on a paid tier, a ⚠️ Verify badge appears on the card. Diagnostic endpoint: GET /api/ingest/omni-debug?token=.",
  },

  {
    id: "omni_sheet",
    category: "ingest",
    name: "Omni — Google Sheets (deprecated)",
    status: "deprecated",
    delivery: "Omni → Google Sheets (daily overwrite) → Apps Script → POST /api/ingest/omni-sheet",
    schedule: "Was: Daily at 6AM",
    fields: [],
    filters: null,
    notes: "Replaced by omni_webhook. Google Sheets dependency removed. Apps Script trigger should be disabled.",
  },

  {
    id: "common_room",
    category: "ingest",
    name: "Common Room",
    status: "wired_not_connected",
    delivery: "Common Room webhook → POST /api/ingest/common-room",
    schedule: "Real-time on trigger",
    fields: [
      "email",
      "full_name",
      "company",
      "linkedin_url (low confidence — dedup carefully)",
      "visited_url",
      "signal_type",
      "github_repo (if GitHub trigger)",
    ],
    filters: "Recency filtering is difficult in Common Room — signals do not reliably include activity date.",
    notes: null,
    signals: [
      {
        id: "cr_web_visits",
        name: "Web pages visited",
        status: "wired_not_connected",
        handling: "Individual page URLs captured per lead. Account-level theme analysis planned: identify topics across all pages viewed by all leads from the same company in the last 30 days.",
      },
      {
        id: "cr_job_postings",
        name: "Job postings",
        status: "planned",
        handling: "Claude reads the full job req, identifies teams hiring for GraphQL, and logs them as account-level 'teams building on GraphQL'. Builds a persistent GraphQL team map across accounts for future prospecting.",
      },
      {
        id: "cr_github",
        name: "GitHub downloads",
        status: "wired_not_connected",
        handling: "Apollo repo download = warm signal. Competitor repo download = hot signal. Both are flagged for rep review — no automatic queue escalation. Competitor identity stored in signal history.",
      },
      {
        id: "cr_linkedin",
        name: "LinkedIn profiles",
        status: "wired_not_connected",
        handling: "Used when available. Flagged as low-confidence — Common Room matching produces duplicates and partial matches. Never block on missing LinkedIn. Rep should verify before using.",
      },
    ],
  },

  {
    id: "salesforce",
    category: "ingest",
    name: "Salesforce (planned)",
    status: "planned",
    delivery: "Webhook or scheduled sync — not yet designed. AuthN via Salesforce SSO when multi-rep.",
    schedule: "TBD",
    fields: [
      "webinar_attendees",
      "whitepaper_downloads",
      "campaign_membership",
      "email_engagement",
      "contact_enrichment",
    ],
    filters: "Webinar attendees and whitepaper downloads are priority ingest triggers. Will not duplicate contact records already in Salesforce — Salesforce remains system of record.",
    notes: "Blocked on multi-rep rollout. AuthN via Salesforce SSO required before this integration makes sense.",
  },

  {
    id: "manual",
    category: "ingest",
    name: "Manual Entry",
    status: "live",
    delivery: "Rep enters via New Lead form in app",
    schedule: "On demand",
    fields: ["name", "title", "email", "company", "linkedin_url", "visited_urls", "extra_context"],
    filters: null,
    notes: null,
  },

  // ─── RESEARCH SOURCES ────────────────────────────────────────────────────────
  // Searched by Claude during account research generation.

  {
    id: "web_search",
    category: "research",
    name: "Web Search (Claude)",
    status: "live",
    delivery: "Claude web_search tool during account research and draft generation",
    schedule: "On generate (if account cache older than 14 days or empty). Manual refresh via Refresh Research button.",
    fields: ["company_overview", "recent_news", "tech_stack_signals", "engineering_blog", "job_postings", "executive_quotes"],
    filters: "14-day cache per account. Research writes back to account.webResearch. Source citation required on every bullet — no uncited technical claims.",
    notes: "Personal workspace names ([Name]'s Team) trigger email domain lookup instead of org name search. Developer-tool companies (Datadog, Stripe, etc.) are researched as engineering orgs, not as products.",
  },

  {
    id: "sec_edgar",
    category: "research",
    name: "SEC EDGAR / Earnings",
    status: "live",
    delivery: "Claude web_search tool → EDGAR full-text search + earnings call transcripts + investor presentations",
    schedule: "On demand via Refresh Research button. Stored in account.edgarData.",
    fields: ["10-K annual reports", "earnings call transcripts", "investor presentations", "8-K material events", "executive quotes"],
    filters: "Public companies only. Focuses on AI/ML investment, digital transformation, API platform spend, engineering headcount, and direct executive quotes.",
    notes: "EDGAR data is injected into email draft generation — executive quotes from earnings calls are used as email hooks. Run Refresh Research on an account to populate.",
  },

  {
    id: "job_signals",
    category: "research",
    name: "Job Signal Research",
    status: "live",
    delivery: "Claude web_search tool during account research",
    schedule: "On demand via Refresh Research button. Stored in account.jobSignals.",
    fields: ["open_roles", "team_names", "tech_stack_from_jds", "hiring_velocity"],
    filters: "Looks for GraphQL, API platform, federation, and developer tooling roles. Hiring signals indicate teams building on GraphQL.",
    notes: null,
  },

  {
    id: "google_drive",
    category: "research",
    name: "Google Drive (internal research)",
    status: "planned",
    delivery: "Google Drive MCP or API → account research prompt",
    schedule: "On demand during account research",
    fields: ["existing account research docs", "competitive intelligence", "sales call notes", "industry reports"],
    filters: "Search by account name and related keywords. Surface existing research before running external searches.",
    notes: "Goal: don't re-research what the team already knows. Drive research should be injected first, before web or EDGAR searches.",
  },

  // ─── ENRICHMENT SOURCES ──────────────────────────────────────────────────────
  // Add context to existing accounts and leads.

  {
    id: "github_enrichment",
    category: "enrichment",
    name: "GitHub Username Lookup",
    status: "live",
    delivery: "GitHub public API (/users/{username}). Triggered via POST /api/ingest/github-enrich?token= or daily cron.",
    schedule: "Daily at 2pm ET (1hr after Omni sync). Processes un-enriched personal-email leads only. Manual backfill: bun scripts/github-enrich-local.js.",
    fields: ["company", "location", "bio", "followers", "public_repos"],
    filters: "Personal-email leads only (gmail, yahoo, hotmail, icloud). Extracts GitHub handle from Studio Org name (e.g. 'francisprovencher's Team' → 'francisprovencher'). Skips leads already marked GitHub: checked.",
    notes: "If GitHub profile has a company field, creates/matches an account and moves the lead there. Adds GitHub Co: [company] to extraContext. Rate limit: 60 req/hr unauthenticated. Set GITHUB_TOKEN env var for 5000 req/hr.",
  },

  {
    id: "wiza",
    category: "enrichment",
    name: "Wiza (LinkedIn enrichment)",
    status: "planned",
    delivery: "Wiza API — not yet integrated",
    schedule: "TBD — likely on-demand per lead or batch on ingest",
    fields: ["linkedin_url", "work_email", "company", "title", "location"],
    filters: "Most useful for personal-email leads (gmail etc.) where employer is unknown. Requires first + last name for matching.",
    notes: "Apollo already has a Wiza subscription. Would de-anonymize gmail leads that GitHub lookup misses. Complements GitHub enrichment — GitHub catches developers with public profiles, Wiza catches everyone else.",
  },

  {
    id: "hubspot_enrichment",
    category: "enrichment",
    name: "HubSpot Enrichment",
    status: "planned",
    delivery: "HubSpot API — not yet designed",
    schedule: "TBD",
    fields: ["contact_properties", "company_properties", "deal_history", "campaign_history"],
    filters: null,
    notes: "Enrichment layer for contacts already in Voyager 1. Campaign membership and email engagement history would provide strong signal for personalization.",
  },

  {
    id: "slack",
    category: "enrichment",
    name: "Slack (internal context)",
    status: "planned",
    delivery: "Slack MCP or API — not yet designed",
    schedule: "On demand during account research",
    fields: [
      "channel_messages",
      "thread_context",
      "shared_images",
      "shared_files",
      "deal_discussion",
      "customer_mentions",
    ],
    filters: "Search by account name and contact name across relevant channels (deal rooms, AE channels, #graphql-customers, etc.).",
    notes: "High value for accounts the team has already discussed. Rep Slack threads contain pricing context, objections, org chart notes, and screenshots that never make it into Salesforce.",
    signals: [
      {
        id: "slack_deal_rooms",
        name: "Deal room channels",
        status: "planned",
        handling: "Dedicated account channels (e.g. #deal-acme) contain the richest context. Search for account name, extract thread summaries, surface key facts (decision maker, blocker, last touch) into account research.",
      },
      {
        id: "slack_images",
        name: "Shared images and screenshots",
        status: "planned",
        handling: "Screenshots of org charts, whiteboard sessions, architecture diagrams, and competitor references are often shared in Slack and lost. Claude reads shared images using vision and extracts structured insights for the account record.",
      },
      {
        id: "slack_customer_mentions",
        name: "Customer and prospect mentions",
        status: "planned",
        handling: "Search company name across all accessible channels. Surfaces informal context: deal status, new hires, blockers, competitive mentions. Pre-populates account notes before a rep opens Voyager 1.",
      },
    ],
  },

];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const STATUS_META = {
  live:                { label: "Live",                color: "#16a34a" },
  wired_not_connected: { label: "Wired, not connected", color: "#d97706" },
  partial:             { label: "Partial",              color: "#2563eb" },
  planned:             { label: "Planned",              color: "#6b7280" },
  deprecated:          { label: "Deprecated",           color: "#9ca3af" },
};

export function sourcesByCategory(category) {
  return DATA_SOURCES.filter(s => s.category === category);
}
