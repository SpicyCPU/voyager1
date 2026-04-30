import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const leadCols = await client.execute("PRAGMA table_info(Lead)");
const acctCols = await client.execute("PRAGMA table_info(Account)");

console.log("Lead columns:", leadCols.rows.map(r => r[1]));
console.log("\nAccount columns:", acctCols.rows.map(r => r[1]));
