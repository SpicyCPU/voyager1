-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "company" TEXT NOT NULL,
    "webResearch" TEXT,
    "edgarData" TEXT,
    "driveData" TEXT,
    "jobSignals" TEXT,
    "accountNotes" TEXT
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "visitedUrls" TEXT,
    "extraContext" TEXT,
    "signalType" TEXT NOT NULL DEFAULT 'manual_entry',
    "researchSummary" TEXT,
    "emailSubject" TEXT,
    "emailDraft" TEXT,
    "linkedinNote" TEXT,
    "draftStatus" TEXT NOT NULL DEFAULT 'idle',
    "outreachStatus" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" DATETIME,
    "notes" TEXT,
    CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_company_key" ON "Account"("company");
