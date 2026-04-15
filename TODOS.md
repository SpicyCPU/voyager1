# TODOS — Voyager 1

Deferred work tracked here. Items are not blocked — they are intentionally deferred
until we have the data, infrastructure, or confidence to do them well.

---

## [P1] Individual Rep Logins + Account Ownership

**What:** Replace the single shared `SITE_SECRET` password with Google OAuth (sign in
with Google, restricted to `@apollographql.com`). Add an `assignedTo` field on Lead
so each lead belongs to a specific rep. Filter the queue and accounts view by the
logged-in rep by default, with a manager toggle to see all.

**Why:** As more reps use the tool, a shared password has no accountability, no per-rep
queue, and no way to ensure leads flow to the right person. Account ownership is the
prerequisite for any kind of pipeline tracking or manager visibility.

**Design decisions (pre-resolved):**

- **Auth:** Google OAuth via NextAuth.js, domain-restricted to `@apollographql.com`.
  No sign-up form needed — first login auto-creates the user record.
- **Ownership model:** Soft filtering. Default view = your leads. Managers can toggle
  to see all reps. Hard isolation creates too much friction for reassignments.
- **Roles:** Start with two roles — `rep` and `manager`. No granular RBAC yet.
- **Assignment UI:** Lead detail view gets an "Assign to" dropdown. Ingest routes
  can auto-assign based on territory/round-robin later (P2 follow-on).

**Schema changes needed:**
- New `User` table: id, email, name, role, createdAt
- `assignedTo` (userId FK) on Lead
- Migration + seed for initial rep accounts

**Build order:**
1. NextAuth setup + User table + Google provider (~2h)
2. `assignedTo` on Lead + filtered queue API (~1h)
3. Assignment UI in LeadDetail + ReviewMode (~2h)
4. Manager toggle in dashboard (~1h)

**Effort:** M (human: 1-2 days) → S (CC+gstack: 1 session ~4-5h)
**Priority:** P1
**Depends on:** Decision to deploy to shared team URL (do not build before then)

---

## [P2] Anonymous Visitor De-anonymization

**What:** When Common Room sends an anonymous org web visit (no person identified),
attempt to cross-reference against other available sources to make an educated guess
at the visitor's identity.

**Why:** Anonymous org visits ("Acme Corp visited your pricing page") are valuable
buying-intent signals. If we can connect them to a specific person — even with low
confidence — we can draft outreach instead of leaving the signal unused.

**Idea:** Cross-reference anonymous visit timing against Omni graph sign-ups ("Team
XYZ"), community handles, LinkedIn company pages, and other ingested signals. Build
a confidence score and surface "possible identity" rather than "definite identity."

**Pros:** Unlocks a category of signals currently silently discarded. High-upside for
ICP accounts actively evaluating Apollo.

**Cons:** Experimental. Cross-source identity matching has significant false-positive
risk. Could damage rep credibility if outreach references incorrect assumptions.

**Context:** Anonymous CR payloads have org data but empty `member` field. The
`/api/ingest/common-room` route currently skips these (returns 200, no lead created).
Start by logging them to a separate `anonymous_signals` table or to account notes
before attempting de-anonymization.

**Effort:** XL (human) → L (CC+gstack) — research spike first (M), then implementation
**Priority:** P2
**Depends on:** Common Room integration shipped (P1)

---

## [P2] Recency Bias Formula Fine-tuning

**What:** The queue sort currently uses a 48-hour recency window to boost recently-signaled
leads. The weight and window are hardcoded guesses. Tune them based on real conversion data.

**Why:** A lead who visited pricing 47 hours ago and a lead who visited 2 hours ago
have very different urgency profiles. The current formula treats them the same.

**Pros:** Queue quality improves. Reps always see the most urgent leads first.

**Cons:** Requires a few weeks of real signal data to tune meaningfully. Premature
optimization before that point.

**Context:** `lastSignalAt` field on Lead drives the recency check. Sort logic in
`app/api/queue/route.js`. Consider making the window configurable via Settings tab.

**Effort:** S (human) → S (CC+gstack)
**Priority:** P2
**Depends on:** Common Room integration shipped, at least 2 weeks of real signal data

---

## [P2] Signal Priority Validation Against Closed-Won Data

**What:** The queue priority (webinar=0, web_visit=1, job_posting=2,
customer_expansion=3, github_download=4, other=5, manual_entry=6) is a hypothesis.
Validate it against Apollo's closed-won deal data.

**Why:** If github_download actually converts at 3x web_visit, the priority order
is inverted and we're consistently surfacing the wrong leads first.

**Pros:** Data-driven prioritization improves rep time-on-target. A single priority
reordering could meaningfully change pipeline output.

**Cons:** Requires access to closed-won data and enough signal volume to be statistically
meaningful. Probably needs 3+ months of signals before the data is actionable.

**Context:** Priority map in `app/api/queue/route.js` PRIORITY constant. Easy to update
once we know the right order.

**Effort:** S (code change) — the real effort is the data analysis (human)
**Priority:** P2
**Depends on:** Common Room integration shipped, 90+ days of signal data

---

## [P3] Slack Alert for High-Intent Signals

**What:** When a web_visit or github_download signal arrives for a known ICP account
during business hours, send a Slack DM to the assigned rep.

**Why:** The morning queue introduces up to a 15-hour lag between signal and outreach.
For a prospect on the pricing page right now, that's a meaningful delay. A real-time
Slack alert lets reps act immediately when the timing is right.

**Pros:** Addresses the urgency gap. Reps can choose to act immediately or wait for
the morning review.

**Cons:** Alert fatigue if too many signals qualify. Needs configurable thresholds
and a way to define "ICP account." Requires Slack OAuth integration.

**Context:** Would hook into `/api/ingest/common-room` after lead creation. High-score
signals (webinar, web_visit for known accounts) trigger a Slack API call. Signal scoring
(see above) is a prerequisite for reliable alerting.

**Effort:** M (human) → S (CC+gstack)
**Priority:** P3
**Depends on:** Common Room integration shipped, signal scoring validation complete
