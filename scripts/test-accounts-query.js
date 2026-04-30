import { db } from "../lib/db.js";
import { accounts } from "../lib/schema.js";
import { desc } from "drizzle-orm";

try {
  console.time("query");
  const rows = await db.query.accounts.findMany({
    orderBy: [desc(accounts.updatedAt)],
    where: (a, { eq }) => eq(a.tracked, "1"),
    with: {
      leads: {
        where: (l, { isNull }) => isNull(l.deletedAt),
        columns: { id: true, updatedAt: true, outreachStatus: true, signalType: true },
      },
    },
  });
  console.timeEnd("query");
  console.log("tracked accounts:", rows.length);
  if (rows[0]) console.log("sample keys:", Object.keys(rows[0]));
} catch (e) {
  console.error("QUERY ERROR:", e.message);
  console.error(e.stack);
}
process.exit(0);
