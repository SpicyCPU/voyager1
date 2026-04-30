// scripts/github-enrich-local.js
//
// Runs GitHub username enrichment locally — no Vercel timeout, no token needed.
// Processes all un-enriched personal-email leads at ~60 req/hr (GitHub public limit).
//
// Usage:
//   bun scripts/github-enrich-local.js
//
// Runs until complete or rate-limited. Safe to re-run — skips already-checked leads.

import { enrichLeadsViaGitHub } from "../lib/github-enrich.js";

console.log("Starting GitHub enrichment...");
console.log("Rate limit: ~60 req/hr unauthenticated. Let this run in the background.\n");

const start = Date.now();
const stats = await enrichLeadsViaGitHub(null, process.env.GITHUB_TOKEN ?? null);
const mins = ((Date.now() - start) / 60000).toFixed(1);

console.log(`\nDone in ${mins} minutes.`);
console.log(`Checked: ${stats.checked}`);
console.log(`Enriched with company: ${stats.enriched}`);
console.log(`Not found on GitHub: ${stats.notFound}`);
console.log(`No username to try: ${stats.noUsername}`);
console.log(`Already done: ${stats.alreadyDone}`);
if (stats.errors.length) console.log(`Errors:`, stats.errors);
