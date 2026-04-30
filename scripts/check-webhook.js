import { db } from "../lib/db.js";
import { leads } from "../lib/schema.js";
import { desc } from "drizzle-orm";

// Check for any omni_webhook hits
const all = await db.query.leads.findMany({
  orderBy: [desc(leads.updatedAt)],
  limit: 10,
  with: { account: true },
});

console.log("10 most recently updated leads:");
for (const l of all) {
  const src = (() => { try { return JSON.parse(l.signalHistory ?? "[]")[0]?.source; } catch { return "?"; } })();
  const lastSrc = (() => { try { const h = JSON.parse(l.signalHistory ?? "[]"); return h[h.length-1]?.source; } catch { return "?"; } })();
  console.log(`  updated: ${l.updatedAt?.slice(0,16)}  created: ${l.createdAt?.slice(0,10)}  [${lastSrc}]  ${l.name} — ${l.account?.company}`);
}
