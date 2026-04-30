import { db } from "../lib/db.js";
import { leads } from "../lib/schema.js";
import { desc } from "drizzle-orm";

const recent = await db.query.leads.findMany({
  orderBy: [desc(leads.createdAt)],
  limit: 5,
  with: { account: true },
});

console.log("5 most recently created leads:");
for (const l of recent) {
  const src = (() => { try { return JSON.parse(l.signalHistory ?? "[]")[0]?.source; } catch { return "?"; } })();
  console.log(`  ${l.createdAt?.slice(0,16)}  [${src}]  ${l.name} — ${l.account?.company}`);
}
