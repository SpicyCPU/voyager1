-- AlterTable: add signalHistory and lastSignalAt to Lead
ALTER TABLE "Lead" ADD COLUMN "signalHistory" TEXT;
ALTER TABLE "Lead" ADD COLUMN "lastSignalAt" TEXT;
