import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/schema";
import { eq, isNull, desc } from "drizzle-orm";

export async function GET() {
  const rows = await db.query.leads.findMany({
    where: (l, { and, eq, isNull }) => and(eq(l.outreachStatus, "sent"), isNull(l.deletedAt)),
    orderBy: [desc(leads.sentAt)],
    with: { account: true },
  });

  return NextResponse.json({ leads: rows });
}
