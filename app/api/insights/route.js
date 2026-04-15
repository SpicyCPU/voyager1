import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts, refinementExamples } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// GET /api/insights
//
// Synthesizes patterns across all outreach data:
// - Company metadata (industry, headcount, companyType) across all accounts
// - Lead signal types and outcomes (sent, replied, etc.)
// - Refinement examples — what the rep has been editing and why
// Returns conversational text insights from Claude.

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  try {
    // Gather all accounts with metadata
    const allAccounts = await db.select({
      id: accounts.id,
      company: accounts.company,
      industry: accounts.industry,
      headcount: accounts.headcount,
      companyType: accounts.companyType,
    }).from(accounts);

    // Gather all leads with outreach status
    const allLeads = await db.select({
      id: leads.id,
      accountId: leads.accountId,
      name: leads.name,
      title: leads.title,
      signalType: leads.signalType,
      outreachStatus: leads.outreachStatus,
      emailSubject: leads.emailSubject,
      emailDraft: leads.emailDraft,
      draftStatus: leads.draftStatus,
      sentAt: leads.sentAt,
      deletedAt: leads.deletedAt,
    }).from(leads);

    // Gather recent refinement examples (last 20, newest first)
    const examples = await db.select().from(refinementExamples)
      .orderBy(desc(refinementExamples.createdAt))
      .limit(20);

    // Build a compact data summary to pass to Claude
    const accountMap = Object.fromEntries(allAccounts.map(a => [a.id, a]));

    // Industry breakdown
    const industryCounts = {};
    const headcountCounts = {};
    const companyTypeCounts = {};
    for (const a of allAccounts) {
      if (a.industry) industryCounts[a.industry] = (industryCounts[a.industry] ?? 0) + 1;
      if (a.headcount) headcountCounts[a.headcount] = (headcountCounts[a.headcount] ?? 0) + 1;
      if (a.companyType) companyTypeCounts[a.companyType] = (companyTypeCounts[a.companyType] ?? 0) + 1;
    }

    // Separate active vs deleted leads
    const activeLeads = allLeads.filter(l => !l.deletedAt);
    const deletedLeads = allLeads.filter(l => l.deletedAt);

    // Lead outcomes by industry
    const sentLeads = activeLeads.filter(l => l.outreachStatus === "sent" || l.outreachStatus === "replied");
    const totalByIndustry = {};
    for (const l of activeLeads) {
      const acct = accountMap[l.accountId];
      const ind = acct?.industry ?? "unknown";
      totalByIndustry[ind] = (totalByIndustry[ind] ?? 0) + 1;
    }

    // Deleted leads by industry — qualification discard rate per segment
    const deletedByIndustry = {};
    const deletedBySignalType = {};
    for (const l of deletedLeads) {
      const acct = accountMap[l.accountId];
      const ind = acct?.industry ?? "unknown";
      deletedByIndustry[ind] = (deletedByIndustry[ind] ?? 0) + 1;
      deletedBySignalType[l.signalType] = (deletedBySignalType[l.signalType] ?? 0) + 1;
    }

    // Signal type breakdown (active leads only)
    const signalCounts = {};
    for (const l of activeLeads) {
      signalCounts[l.signalType] = (signalCounts[l.signalType] ?? 0) + 1;
    }

    // Sent email subjects (for theme analysis) — cap at 20
    const sentSubjects = sentLeads
      .filter(l => l.emailSubject)
      .slice(0, 20)
      .map(l => {
        const acct = accountMap[l.accountId];
        return `[${acct?.industry ?? "?"}] ${l.emailSubject}`;
      });

    // Refinement themes — what feedback the rep gave
    const refinementFeedbacks = examples.map(e => `"${e.feedback}" (${e.field})`);

    const dataBlock = [
      `TOTAL ACCOUNTS: ${allAccounts.length}`,
      `ACTIVE LEADS: ${activeLeads.length}`,
      `DELETED LEADS (rep discarded as unqualified): ${deletedLeads.length}`,
      `SENT/REPLIED LEADS: ${sentLeads.length}`,
      "",
      `INDUSTRY BREAKDOWN (accounts with metadata):`,
      Object.entries(industryCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => `  ${k}: ${v}`).join("\n") || "  (none yet)",
      "",
      `HEADCOUNT BREAKDOWN:`,
      Object.entries(headcountCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => `  ${k}: ${v}`).join("\n") || "  (none yet)",
      "",
      `COMPANY TYPE BREAKDOWN:`,
      Object.entries(companyTypeCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => `  ${k}: ${v}`).join("\n") || "  (none yet)",
      "",
      `SIGNAL TYPE BREAKDOWN (active leads):`,
      Object.entries(signalCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => `  ${k}: ${v}`).join("\n") || "  (none yet)",
      "",
      `DELETED LEADS BY INDUSTRY (rep discarded):`,
      Object.entries(deletedByIndustry).sort((a,b) => b[1]-a[1]).map(([k,v]) => `  ${k}: ${v}`).join("\n") || "  (none yet)",
      "",
      `DELETED LEADS BY SIGNAL TYPE:`,
      Object.entries(deletedBySignalType).sort((a,b) => b[1]-a[1]).map(([k,v]) => `  ${k}: ${v}`).join("\n") || "  (none yet)",
      "",
      `SENT EMAIL SUBJECTS (sample):`,
      sentSubjects.length > 0 ? sentSubjects.map(s => `  ${s}`).join("\n") : "  (none yet)",
      "",
      `RECENT REP REFINEMENT FEEDBACK (instructions the rep gave to the AI to improve its drafts — these reflect the rep's style preferences, not problems with the rep):`,
      refinementFeedbacks.length > 0 ? refinementFeedbacks.map(f => `  ${f}`).join("\n") : "  (none yet)",
    ].join("\n");

    const prompt = [
      `You are an analyst for an Apollo GraphQL sales rep using an outreach tool called Voyager 1. The tool uses AI to generate outreach drafts; the rep then refines them by giving feedback to the AI. The refinement feedback listed below is the rep's instructions TO the AI — it reflects the rep's style preferences, not mistakes the rep is making. Below is aggregated data about the leads and accounts in the rep's pipeline.`,
      "",
      APOLLO_PRODUCT_CONTEXT,
      "",
      `DATA SUMMARY:`,
      dataBlock,
      "",
      `Write a concise, conversational intelligence brief (4–6 short paragraphs, no bullet lists) covering:`,
      `1. What types of companies and industries dominate this rep's active pipeline — and what that means for Apollo fit`,
      `2. What the deleted (discarded) leads reveal about which segments or signal types the rep is filtering out — and whether that pattern makes sense`,
      `3. What the email subjects and outreach themes suggest about what's landing`,
      `4. What the rep's refinement feedback (instructions they gave to the AI) reveals about their preferred outreach style — what tone, length, or angle they consistently push the AI toward`,
      `5. One or two concrete recommendations: where to focus more effort, or what types of leads to stop spending time on`,
      "",
      `Be specific and data-driven. Reference the actual numbers. If the data is too sparse to draw conclusions, say so clearly and suggest what additional data would make this more useful. Do not use bullet points or headers — write in plain paragraphs.`,
    ].join("\n");

    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const insights = data.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";

    return NextResponse.json({
      insights,
      meta: {
        totalAccounts: allAccounts.length,
        activeLeads: activeLeads.length,
        deletedLeads: deletedLeads.length,
        sentLeads: sentLeads.length,
        refinementCount: examples.length,
        accountsWithMetadata: allAccounts.filter(a => a.industry).length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
