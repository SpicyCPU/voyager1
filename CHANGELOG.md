# Changelog

All notable changes to Voyager 1 are documented here.

## [0.1.0.0] - 2026-04-14

### Added
- **Insights tab** (formerly Patterns) — load-on-demand Claude synthesis of outreach data; stat cards for accounts, active leads, deleted leads, sent/replied, refinements, and accounts with metadata
- **Soft-delete leads** — deleting a lead sets `deletedAt` rather than removing the row; retained as a qualification discard signal for Insights analysis
- **ContextPanel** in review mode — collapsible panel for Common Room signals, Pages Visited, and Salesforce context; auto-saves on blur; shows "X fields filled" badge when collapsed
- **Discard button in review header** — one-click lead discard without scrolling; no confirmation dialog; advances to next lead automatically
- **Skip button in review header** — moved from bottom action bar to header for fast triage access
- **Subscription tier on triage cards** — FREE / DEVELOPER / BUSINESS plan displayed on each lead card and source card
- **Lead source signals on review page** — qualifying signals (Studio Sign-up, GitHub, web visit, etc.) shown with metadata
- **Seamless refinement learning** — rep edits auto-detected as few-shot style examples; stored in `RefinementExample` table and injected at generation time; learning banner shows "Stored in memory"
- **Triage gate** — new leads start in `idle` state; must pass triage before entering the queue
- **DB-backed rules** — writing rules stored in database instead of component state; survive page refresh
- **Save-as-rule from feedback** — rule suggestions from the Refine panel can be saved to the DB in one click
- **Apollo product context** — plans, licensing, Connectors, and sunset dates injected into every Claude prompt for informed outreach
- **Tracked accounts** — manual and auto-track; Accounts tab watchlist with AI-suggested accounts
- **Account rename** — accounts can be renamed; uniqueness check prevents collisions
- **Sources tab** — data source management page in AppShell navigation
- `crEnrichment` and `sfContext` fields on accounts — dedicated enrichment columns that never overwrite existing research data

### Fixed
- Web search added to research step — drafts were generating without live web data
- Idle leads now appear in queue and auto-generate when opened in review
- `TURSO_AUTH_TOKEN` support in DB client
- Subscription tier now shows as plain text (was rendering as badge component)

### Changed
- Patterns tab renamed to Insights
- Remove rule cap; soft warning added at 20+ rules; generation timing shown
- Discard and Skip moved to review header for faster lead triage

## [0.1.0.0] - 2026-04-08

### Added
- Auth middleware protecting all routes with a `SITE_SECRET` password; `/api/ingest/*` routes bypass (they carry their own auth)
- Login page at `/login` styled to Apollo brand (Horizon orange, Nebula dark)
- `/api/auth/login` and `/api/auth/logout` routes; session stored as HttpOnly cookie, 1-year TTL
- 16 auth middleware tests covering cookie validation, route bypass, and missing `SITE_SECRET` handling
- Security audit report saved to `.gstack/security-reports/`
- `[P1]` TODO for individual rep logins + account ownership with design decisions captured

### Changed
- Google Sheet webhook call moved from client-side (`LeadDetail.js`) to server-side (`/api/leads/[id]/send`); `NEXT_PUBLIC_WEBHOOK_URL` removed from JS bundle
- `WEBHOOK_URL` env var no longer needs `NEXT_PUBLIC_` prefix

### Added (previous sessions)
- Morning review queue: dashboard, sequential review mode, completion screen
- Common Room webhook integration: signal ingest, dedup, re-engagement, recency queue boost
- Delete lead button in review mode
- REST API: accounts, leads, queue, ingest routes
- Prisma schema + Drizzle ORM layer with SQLite
- Vitest test suite and GitHub Actions CI

## [0.0.0.0] - 2026-04-03

- Initial project scaffold
