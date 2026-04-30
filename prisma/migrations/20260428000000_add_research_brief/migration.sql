-- AlterTable: add researchBrief (structured JSON from research step) to Lead
ALTER TABLE "Lead" ADD COLUMN "researchBrief" TEXT;
