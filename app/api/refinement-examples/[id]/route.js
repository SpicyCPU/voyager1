import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refinementExamples } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function DELETE(request, { params }) {
  const { id } = await params;
  await db.delete(refinementExamples).where(eq(refinementExamples.id, id));
  return NextResponse.json({ deleted: true });
}
