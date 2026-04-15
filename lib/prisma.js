import { createRequire } from "module";
import path from "path";

// Turbopack auto-externalizes Prisma/libsql packages and appends a content hash
// to their module names, making the standard ESM import fail at runtime.
// createRequire bypasses Turbopack's module graph and uses Node's native resolver.
const _require = createRequire(import.meta.url);
const { PrismaClient } = _require("@prisma/client");
const { PrismaLibSql } = _require("@prisma/adapter-libsql");
const { createClient } = _require("@libsql/client");

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

function createPrismaClient() {
  const url = resolveDbUrl();
  const libsql = createClient({ url });
  const adapter = new PrismaLibSql(libsql);
  return new PrismaClient({ adapter });
}

// Reuse the same instance across hot reloads in dev
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
