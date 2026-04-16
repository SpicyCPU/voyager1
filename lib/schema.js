import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Table names match Prisma's generated names (PascalCase)
export const accounts = sqliteTable("Account", {
  id:           text("id").primaryKey(),
  createdAt:    text("createdAt").notNull(),
  updatedAt:    text("updatedAt").notNull(),
  company:      text("company").notNull().unique(),
  webResearch:   text("webResearch"),
  webResearchAt: text("webResearchAt"), // ISO timestamp — when webResearch was last written
  edgarData:     text("edgarData"),
  driveData:     text("driveData"),
  jobSignals:    text("jobSignals"),
  accountNotes:  text("accountNotes"),
  industry:    text("industry"),     // e.g. "fintech", "healthcare", "saas" — auto-extracted from research
  headcount:   text("headcount"),    // e.g. "11-50", "201-1000", "1000+"
  hq:          text("hq"),           // inferred HQ location, e.g. "United States", "Germany"
  companyType: text("companyType"),  // e.g. "startup", "enterprise", "consultancy", "government"

  crEnrichment: text("crEnrichment"), // Common Room summary — manual paste now, auto-populated when CR API available
  sfContext:    text("sfContext"),    // Salesforce notes — deal stage, owner, open opps, history

  tracked:      text("tracked").notNull().default("0"), // "1" = tracked, "0" = not
  trackedAt:    text("trackedAt"),                      // ISO timestamp — when tracking started
  trackReason:  text("trackReason"),                    // "manual" | "auto_reply" | "auto_leads" | "ai_recommended"
  sourcedVia:   text("sourcedVia"),                     // intermediary/vendor — e.g. "StraightSys (outsourced provider)"
  vendorDomains: text("vendorDomains"),                 // comma-separated domains that route to this account — e.g. "straightsys.com"
});

export const leads = sqliteTable("Lead", {
  id:        text("id").primaryKey(),
  createdAt: text("createdAt").notNull(),
  updatedAt:  text("updatedAt").notNull(),
  accountId: text("accountId").notNull().references(() => accounts.id),

  name:        text("name").notNull(),
  title:       text("title"),
  email:       text("email"),
  linkedinUrl: text("linkedinUrl"),
  visitedUrls: text("visitedUrls"),
  extraContext: text("extraContext"),
  signalType:    text("signalType").notNull().default("manual_entry"),
  signalHistory: text("signalHistory"), // JSON: [{type, url, source, timestamp}]
  lastSignalAt:  text("lastSignalAt"),  // ISO timestamp — recency boost in queue sort

  researchSummary: text("researchSummary"),
  emailSubject:    text("emailSubject"),
  emailDraft:      text("emailDraft"),
  linkedinNote:    text("linkedinNote"),

  draftStatus:    text("draftStatus").notNull().default("idle"),
  outreachStatus: text("outreachStatus").notNull().default("draft"),

  sentAt:    text("sentAt"),
  notes:     text("notes"),
  deletedAt: text("deletedAt"), // ISO timestamp — soft delete; null = active
  deleteReason: text("deleteReason"), // "manual" | future: "auto_disqualified"
});

// Stores before/after refinement pairs — injected as few-shot examples at generate time
export const refinementExamples = sqliteTable("RefinementExample", {
  id:        text("id").primaryKey(),
  createdAt: text("createdAt").notNull(),
  field:     text("field").notNull(),     // "emailDraft" | "linkedinNote"
  feedback:  text("feedback").notNull(),  // what the rep said
  before:    text("before").notNull(),    // original draft
  after:     text("after").notNull(),     // refined result
  leadId:    text("leadId"),              // optional — for context
});

// Single-row settings table (id always "default")
export const appSettings = sqliteTable("AppSettings", {
  id:        text("id").primaryKey().default("default"),
  rules:     text("rules"),      // JSON array of rule strings (max 12)
  updatedAt: text("updatedAt"),
});

export const accountsRelations = relations(accounts, ({ many }) => ({
  leads: many(leads),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  account: one(accounts, { fields: [leads.accountId], references: [accounts.id] }),
}));
