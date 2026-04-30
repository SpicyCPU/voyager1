// scripts/test-omni-ingest.js
// Run with: INGEST_SECRET=<secret> node scripts/test-omni-ingest.js [local|prod]
//
// Tests the /api/ingest/omni-sheet endpoint with a realistic sample row.
// Use `local` to hit localhost:3000, `prod` to hit the Vercel deployment.

const target = process.argv[2] ?? "local";
const BASE_URL = target === "prod"
  ? "https://voyager1-outreach.vercel.app"
  : "http://localhost:3000";

const INGEST_SECRET = process.env.INGEST_SECRET;
if (!INGEST_SECRET) {
  console.error("ERROR: set INGEST_SECRET env var first");
  console.error("  INGEST_SECRET=abc123 node scripts/test-omni-ingest.js [local|prod]");
  process.exit(1);
}

const sampleRows = [
  {
    "Email": `test-ingest-${Date.now()}@testcorp.com`,
    "Full Name": "Test Ingest User",
    "Account Name": `Test Corp ${Date.now()}`,
    "Studio Organization Name": `Test Corp ${Date.now()}`,
    "Subscription Tier": "BUSINESS",
    "Is Using Router": true,
    "Total Federated Graphs": 3,
    "Total Unique Subgraphs": 12,
    "Requests Last 30 Days": 250000,
    "Total Active Users Last 30 Days": 18,
    "Has Router Operations Last 7days": true,
    "Last Seen At": new Date(Date.now() - 86400000).toISOString(), // yesterday
    "Created At Date": new Date(Date.now() - 7 * 86400000).toISOString(),
  }
];

const payload = { rows: sampleRows, mode: "test" };

console.log(`\nPosting to: ${BASE_URL}/api/ingest/omni-sheet`);
console.log(`Row count: ${sampleRows.length}`);
console.log(`Email: ${sampleRows[0]["Email"]}`);
console.log(`Company: ${sampleRows[0]["Account Name"]}\n`);

try {
  const res = await fetch(`${BASE_URL}/api/ingest/omni-sheet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-secret": INGEST_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (res.ok && data.created > 0) {
    console.log("\n✅ Endpoint is working — lead was created");
    console.log("   → If new leads aren't appearing, the issue is in the Apps Script (filtering too strict or wrong URL)");
  } else if (res.status === 401) {
    console.log("\n❌ Auth failed — INGEST_SECRET doesn't match what's set in Vercel env vars");
  } else if (res.ok && data.skipped > 0) {
    console.log("\n⚠️  Endpoint reachable but rows were skipped — check field names");
  } else {
    console.log("\n❌ Unexpected response — see above for details");
  }
} catch (err) {
  console.error("\n❌ Network error:", err.message);
  if (target === "local") {
    console.error("   Is the dev server running? (bun run dev)");
  }
}
