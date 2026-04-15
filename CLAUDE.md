# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Voyager 1** — a single-page React app for Apollo GraphQL's B2B sales outreach team. Sales reps input prospect data (visited URLs, LinkedIn, extra context), and the app uses Claude to generate personalized email + LinkedIn outreach drafts. It also supports AI-assisted follow-up generation and logs sent emails to a Google Sheet.

## Architecture

Everything lives in a single file: `App.jsx`. No backend, no build tooling configured yet — likely runs via Vite or a similar bundler.

### Key constants (top of file)

- `A` — Apollo brand color palette (Horizon orange, Nebula dark, etc.)
- `WEBHOOK_URL` — Google Apps Script endpoint; logs sent emails to a Google Sheet
- `CUSTOMER_CLUSTERS` — ~15 industry verticals with named Apollo customers, injected into the Claude system prompt for reference
- `DEFAULT_RULES` — Writing rules injected into every Claude prompt (no dashes, no hollow phrases, etc.)
- `DEFAULT_S1` — Research signals for initial outreach (visited URLs, LinkedIn, news)
- `DEFAULT_S2` — Research sources for follow-up generation (SEC EDGAR, Seeking Alpha)

### Claude API usage

All Claude calls go directly from the browser to `https://api.anthropic.com/v1/messages` — no proxy, no backend. **This means the API key must be embedded or provided client-side**, which is a security concern for anything beyond internal tooling.

- Model: `claude-sonnet-4-20250514`
- Initial draft: no tools, 20s timeout, returns JSON `{url_insights, linkedin_insights, web_insights, email_subject, email_body, linkedin_message}`
- Follow-up: uses `web_search_20250305` tool, handles `tool_use` stop reason with a second API call
- Refinement (FeedbackPanel): plain text rewrite, no tools
- Gmail draft: uses `mcp_servers` with the Gmail MCP server

### Component tree

```
App
├── ProspectForm       — add/edit a prospect (name, title, company, email, LinkedIn, visited URLs, extra context)
├── QueueItem          — single row in the queue list with status pill + Generate/Retry/Delete actions
├── DetailPanel        — shows insight cards + email/LinkedIn tabs + edit controls
│   ├── FeedbackPanel  — "Refine with AI" — sends feedback, rewrites the current draft, supports undo history
│   └── FollowUpPanel  — generates follow-up email using web search; only shown after "I sent this email"
└── SentTab            — list of sent emails with overdue highlighting (≥3 work days)
```

### State (App-level)

- `queue` — array of prospect objects with status (`pending` | `generating` | `ready` | `sent` | `error`)
- `sel` — index of currently selected prospect
- `generating` — boolean lock (only one generation at a time)
- `rules`, `s1`, `s2` — editable lists of writing rules and research areas (persisted in component state only — refreshing loses changes)
- `editIdx` — which queue item is being edited in ProspectForm

### Tabs

- **Queue** — add prospects, generate drafts, view/edit output
- **Sent** — sent emails with follow-up tracking; overdue flag at ≥3 work days
- **Copy Rules** — editable list of writing rules injected into every prompt
- **Research Areas** — editable Step 1 (initial) and Step 2 (follow-up) research signals

## Known issues / things to be aware of

- **API key exposure**: the Anthropic API key must be client-side. Fine for internal tooling, not for anything public-facing.
- **No persistence**: queue state lives in React state only. Refreshing the page loses all prospects and drafts.
- **Single-threaded generation**: only one prospect can generate at a time (`generating` boolean lock).
- **20s timeout on initial generation** — hard-coded; follow-up has no timeout.
- `workDaysSince` iterates day-by-day which is fine for small date ranges but inefficient for large gaps.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## Testing

Run: `bun run test`
Test directory: `__tests__/`
Framework: vitest + @testing-library/react + jsdom

**Setup note:** App components use `.js` extension with JSX content (Next.js convention). A custom pre-transform Babel plugin in `vitest.config.js` handles this before OXC runs.

When writing new functions, write a corresponding test. When fixing a bug, write a regression test. When adding error handling, write a test that triggers the error. When adding a conditional, test both paths.
