// lib/omni.js
//
// Omni API client — fetches and runs workbook queries, returns plain JS row objects.
//
// Auth: Bearer token from OMNI_API_KEY env var.
// Data format: Omni returns base64-encoded Apache Arrow IPC streams.
//              We decode via apache-arrow and convert to plain objects.

import { tableFromIPC } from "apache-arrow";

const BASE_URL = "https://apollographql.omniapp.co/api";

// Fetch all query definitions from a workbook document.
// documentId: e.g. "1:J8WzSKHq" (from embed URL /e/1:J8WzSKHq/...)
export async function getDocumentQueries(apiKey, documentId) {
  const res = await fetch(`${BASE_URL}/v1/documents/${documentId}/queries`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Omni documents API error ${res.status}: ${err}`);
  }
  return res.json();
}

// Run a query object (as returned by getDocumentQueries) and return plain JS rows.
// Polls until complete (Omni may return async job status for slow queries).
export async function runQuery(apiKey, query, { limit = 5000 } = {}) {
  const body = { ...query, limit };

  const res = await fetch(`${BASE_URL}/v1/query/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Omni query/run error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Poll if query is still running
  if (data.status !== "COMPLETE" && data.job_id) {
    return pollJobResult(apiKey, data.job_id);
  }

  return decodeArrowResult(data.result);
}

// Poll until Omni job is complete, then decode.
async function pollJobResult(apiKey, jobId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);
    const res = await fetch(`${BASE_URL}/unstable/query/wait?job_id=${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === "COMPLETE") return decodeArrowResult(data.result);
  }
  throw new Error("Omni query timed out after polling");
}

// Decode base64 Arrow IPC stream → array of plain JS objects.
function decodeArrowResult(base64Result) {
  if (!base64Result) return [];
  const buf = Buffer.from(base64Result, "base64");
  const table = tableFromIPC(buf);
  const rows = [];
  for (const row of table) {
    // row.toJSON() converts Arrow types (BigInt, Utf8, etc.) to plain values
    rows.push(Object.fromEntries(
      Object.entries(row.toJSON()).map(([k, v]) => [
        k,
        typeof v === "bigint" ? Number(v) : v,
      ])
    ));
  }
  return rows;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
