// lib/data-sources.js
//
// Single source of truth for every system that feeds Voyager 1.
// Three categories:
//   ingest    — create or update leads (people enter the queue from here)
//   research  — Claude actively searches these during account research generation
//   enrichment — add context to existing leads and accounts
//
// Statuses:
//   live                — connected and flowing
//   wired_not_connected — route/auth built, not yet enabled in the source system
//   partial             — connected but limited (e.g. missing fields, no recency filter)
//   planned             — designed but not yet built

export const DATA_SOURCES = [

  // ─── INGEST SOURCES ──────────────────────────────────────────────────────────

  {
    id: "omni_sheet",
    category: "ingest",
    name: "Omni — Studio Sign-ups",
    status: "live",
    delivery: "Omni → Google Sheets (daily overwrite) → Apps Script → POST /api/ingest/omni-sheet",
    schedule: "Daily at 6AM (new corporate sign-ups since yesterday) + one-time high-value initial import",
    fields: [
      "email",
      "full_name",
      "studio_org_name",
      "subscription_tier",
      "is_using_router",
      "requests_last_30d",
      "last_seen_at",
      "has_router_ops_last_7d",
      "total_federated_graphs",
      "total_unique_subgraphs",
      "total_active_users_last_30d",
    ],
    filters: "Corporate email only. Initial import: router active OR >100k req/mo OR using federation.",
    notes: "Omni direct API available when API key is provisioned — would remove Google Sheets dependency.",
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
    id: "salesforce_hubspot",
    category: "ingest",
    name: "Salesforce / HubSpot (TBD)",
    status: "planned",
    delivery: "Webhook or scheduled sync — not yet designed",
    schedule: "TBD",
    fields: [
      "webinar_attendees",
      "whitepaper_downloads",
      "campaign_membership",
      "email_engagement",
      "contact_enrichment",
    ],
    filters: "Webinar attendees and whitepaper downloads are priority ingest triggers.",
    notes: "Source system TBD — Apollo uses both Salesforce (CRM) and HubSpot (campaigns + enrichment). Will not duplicate contact records already in Salesforce. Salesforce remains system of record for account relationships.",
  },

  {
    id: "manual",
    category: "ingest",
    name: "Manual Entry",
    status: "live",
    delivery: "Rep enters via New Lead form",
    schedule: "On demand",
    fields: ["name", "title", "email", "company", "linkedin_url", "visited_urls", "extra_context"],
    filters: null,
    notes: null,
  },

  // ─── RESEARCH SOURCES ────────────────────────────────────────────────────────
  // These are searched by Claude during account research generation,
  // not ingest sources that create leads.

  {
    id: "web_search",
    category: "research",
    name: "Web Search (general)",
    status: "partial",
    delivery: "Claude web_search tool during account research",
    schedule: "On generate (if account cache is stale or empty) + manual refresh",
    fields: ["company_overview", "recent_news", "tech_stack_signals", "funding_events"],
    filters: "14-day cache per account. Fresh research writes back to account.webResearch.",
    notes: "Currently uses Claude training knowledge in account research endpoint. web_search tool not yet enabled for account-level research — only used in follow-up generation today.",
  },

  {
    id: "sec_edgar",
    category: "research",
    name: "SEC EDGAR",
    status: "planned",
    delivery: "Claude web_search tool → EDGAR full-text search (efts.sec.gov) + company filings",
    schedule: "On demand during account research",
    fields: ["10-K annual reports", "earnings call transcripts", "investor presentations", "8-K material events"],
    filters: "Public companies only. Focus on API platform investment, tech infrastructure spend, and engineering headcount disclosures.",
    notes: "Requires enabling web_search in account research endpoint. Claude should look for mentions of API, GraphQL, developer platform, and infrastructure investment in filings.",
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
    notes: "Goal: don't re-research what the team already knows. Drive research should be injected first, before web or EDGAR searches, so Claude builds on existing context rather than starting fresh.",
  },

  // ─── ENRICHMENT SOURCES ──────────────────────────────────────────────────────
  // Add context to existing accounts and leads.

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
    name: "Slack (internal)",
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
    filters: "Search by account name and contact name across relevant channels (deal rooms, AE channels, #graphql-customers, etc.). Surface conversations and shared assets before generating outreach.",
    notes: "High value for accounts the team has already discussed — rep Slack threads often contain pricing context, objections, org chart notes, and screenshots that never make it into Salesforce. Goal: inject existing Slack context into account research so Claude builds on what the team already knows rather than starting fresh.",
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
        handling: "Screenshots of org charts, whiteboard sessions, architecture diagrams, and competitor references are often shared in Slack and lost. Claude reads shared images using vision and extracts structured insights (team names, tools in use, GraphQL mentions) for the account record.",
      },
      {
        id: "slack_customer_mentions",
        name: "Customer and prospect mentions",
        status: "planned",
        handling: "Search company name across all accessible channels. Surfaces informal context: 'Acme is evaluating us vs. Apollo Federation', 'they just hired a new CTO', 'contract on hold until Q3'. This pre-populates account notes before a rep ever opens Voyager 1.",
      },
    ],
  },

];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const STATUS_META = {
  live:                { label: "Live",               color: "#16a34a" },
  wired_not_connected: { label: "Wired, not connected", color: "#d97706" },
  partial:             { label: "Partial",             color: "#2563eb" },
  planned:             { label: "Planned",             color: "#6b7280" },
};

export function sourcesByCategory(category) {
  return DATA_SOURCES.filter(s => s.category === category);
}
