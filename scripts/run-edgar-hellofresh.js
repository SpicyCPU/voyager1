import { db } from "../lib/db.js";
import { accounts } from "../lib/schema.js";
import { eq } from "drizzle-orm";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search" };
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

async function runSearch(prompt) {
  const makeCall = (msgs) => fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, tools: [WEB_SEARCH_TOOL], messages: msgs }),
    signal: AbortSignal.timeout(90000),
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });

  let data = await makeCall([{ role: "user", content: prompt }]);
  if (data.stop_reason === "tool_use") {
    const toolResults = data.content.filter(b => b.type === "tool_use").map(b => ({
      type: "tool_result", tool_use_id: b.id, content: b.content ? JSON.stringify(b.content) : "No results",
    }));
    data = await makeCall([
      { role: "user", content: prompt },
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults },
    ]);
  }
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
}

const edgarPrompt = `You are a financial research analyst for an Apollo GraphQL sales team. Search for recent earnings calls, annual reports, investor presentations, and executive interviews for HelloFresh SE (Frankfurt Stock Exchange: HFG).

Focus specifically on:
- Executive quotes about AI, ML, data platform, or technology investments
- Digital transformation or engineering efficiency programs
- API strategy, microservices, or developer platform initiatives
- Cost reduction programs tied to technology
- Data unification, real-time data, or platform consolidation mentions
- Any CTO, CPO, or CEO interviews about their technology roadmap

Return 3-5 specific bullets. Include verbatim executive quotes with speaker name and date where found. No narration, no preamble, start with the first bullet.`;

console.log("Running EDGAR/financial research for HelloFresh...\n");
const edgarData = await runSearch(edgarPrompt);

console.log("=== RESULT ===");
console.log(edgarData);

const now = new Date().toISOString();
await db.update(accounts).set({ edgarData, updatedAt: now }).where(eq(accounts.company, "HelloFresh"));
console.log("\nSaved to DB.");
