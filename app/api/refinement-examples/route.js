import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refinementExamples } from "@/lib/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const examples = await db.select()
    .from(refinementExamples)
    .orderBy(desc(refinementExamples.createdAt))
    .limit(30);
  return NextResponse.json({ examples });
}
