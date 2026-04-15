import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import path from "path";
import * as schema from "./schema.js";

function resolveDbUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw || raw === "undefined") {
    return `file:${path.resolve(process.cwd(), "prisma/dev.db")}`;
  }
  if (raw.startsWith("file:")) {
    return `file:${path.resolve(raw.slice(5))}`;
  }
  return raw;
}

function createDb() {
  const url = resolveDbUrl();
  // TURSO_AUTH_TOKEN is required for remote Turso connections; ignored for local file: URLs
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

// Reuse the same instance across hot reloads in dev
const globalForDb = globalThis;
export const db = globalForDb.db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
