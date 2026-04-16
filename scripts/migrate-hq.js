// One-off migration: add "hq" column to Account table
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";

try {
  await db.run(sql`ALTER TABLE "Account" ADD COLUMN "hq" TEXT`);
  console.log("✓ Added hq column to Account");
} catch (e) {
  if (e.message?.includes("duplicate column")) {
    console.log("✓ hq column already exists — nothing to do");
  } else {
    console.error("✗ Migration failed:", e.message);
    process.exit(1);
  }
}
process.exit(0);
