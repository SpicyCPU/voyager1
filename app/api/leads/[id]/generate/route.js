import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, accounts, appSettings, refinementExamples } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { APOLLO_PRODUCT_CONTEXT } from "@/lib/apollo-context";
import { DEFAULT_RULES, DEFAULT_EMAIL_STRATEGY, DEFAULT_RESEARCH_FOCUS } from "@/app/api/settings/route";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const RESEARCH_CACHE_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(request, { params }) {
  const { id } = await params;

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { account: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  await db.update(leads)
    .set({ draftStatus: "running", updatedAt: new Date().toISOString() })
    .where(eq(leads.id, id));

  const generateStart = Date.now();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

    // Load all settings in parallel
    const [settingsRow, examples] = await Promise.all([
      db.query.appSettings.findFirst({ where: eq(appSettings.id, "default") }),
      db.select().from(refinementExamples).orderBy(desc(refinementExamples.createdAt)).limit(5),
    ]);

    const rules = settingsRow?.rules ? JSON.parse(settingsRow.rules) : DEFAULT_RULES;
    const emailStrategy = settingsRow?.emailStrategy ?? DEFAULT_EMAIL_STRATEGY;
    const researchFocus = settingsRow?.researchFocus ?? DEFAULT_RESEARCH_FOCUS;

    const { account } = lead;

    // ── Step 1: Research ─────────────────────────────────────────────────────
    const researchAge = account.webResearchAt
      ? Date.now() - new Date(account.webResearchAt).getTime()
      : Infinity;
    const useCachedResearch = Boolean(account.webResearch) && researchAge < RESEARCH_CACHE_MS;

    let researchSummary;
    if (useCachedResearch) {
      researchSummary = account.webResearch;
    } else {
      const researchPrompt = buildResearchPrompt(lead, account, researchFocus);
      const researchRes = await callClaudeWithSearch(apiKey, researchPrompt);
      const rawResearch = extractText(researchRes);
      const { summary, metadata } = parseResearchOutput(rawResearch);
      researchSummary = summary;

      const now2 = new Date().toISOString();
      await db.update(accounts).set({
        webResearch: researchSummary,
        webResearchAt: now2,
        updatedAt: now2,
        ...(metadata?.industry && { industry: metadata.industry }),
        ...(metadata?.headcount && { headcount: metadata.headcount }),
        ...(metadata?.companyType && { companyType: metadata.companyType }),
      }).where(eq(accounts.id, account.id));
    }

    // ── Step 2: Draft ────────────────────────────────────────────────────────
    const draftPrompt = buildDraftPrompt(lead, account, researchSummary, rules, emailStrategy, examples);
    const draftRes = await callClaude(apiKey, draftPrompt);
    const draftText = extractText(draftRes);
    const parsed = parseJSON(draftText);

    const now = new Date().toISOString();
    const [result] = await db.update(leads).set({
      researchSummary,
      emailSubject: parsed.email_subject ?? null,
      emailDraft: parsed.email_body ?? null,
      linkedinNote: parsed.linkedin_message ?? null,
      draftStatus: "done",
      updatedAt: now,
    }).where(eq(leads.id, id)).returning();

    return NextResponse.json({
      lead: { ...result, account },
      researchSummary,
      emailSubject: parsed.email_subject,
      emailDraft: parsed.email_body,
      linkedinNote: parsed.linkedin_message,
      generateMs: Date.now() - generateStart,
    });

  } catch (err) {
    await db.update(leads)
      .set({ draftStatus: "error", updatedAt: new Date().toISOString() })
      .where(eq(leads.id, id));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Research prompt ───────────────────────────────────────────────────────────

function buildResearchPrompt(lead, account, researchFocus) {
  return [{
    role: "user",
    content: [
      `You are a B2B sales researcher at Apollo GraphQL. Research this prospect and their company. Return 3-6 specific, citable bullets. Start with the bullets — do not narrate your process.`,
      ``,
      `SOURCE CITATION REQUIRED: Every factual bullet must end with [source.com]. No citation = do not include the claim.`,
      ``,
      APOLLO_PRODUCT_CONTEXT,
      ``,
      `WHAT TO LOOK FOR:\n${researchFocus}`,
      ``,
      resolveCompany(lead, account).company
        ? `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${resolveCompany(lead, account).company}`
        : `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} — employer unknown (personal email, personal workspace name)`,
      resolveCompany(lead, account).note ?? "",
      lead.signalType ? `Signal: ${lead.signalType}` : "",
      lead.visitedUrls ? `Pages visited on apollographql.com:\n${lead.visitedUrls}` : "",
      lead.extraContext ? `PRODUCT USAGE SIGNALS (Omni data — what this person is actually doing in GraphOS):\n${parseExtraContextForLLM(lead.extraContext) || lead.extraContext}` : "",
      account.webResearch ? `PRIOR RESEARCH:\n${account.webResearch}` : "",
      account.edgarData ? `FINANCIAL DATA:\n${account.edgarData}` : "",
      account.jobSignals ? `JOB SIGNALS: ${account.jobSignals}` : "",
      account.accountNotes ? `ACCOUNT NOTES: ${account.accountNotes}` : "",
      account.crEnrichment ? `COMMON ROOM SIGNALS: ${account.crEnrichment}` : "",
      account.sfContext ? `SALESFORCE CONTEXT: ${account.sfContext}` : "",
      ``,
      `EMAIL = GOLDEN RECORD: The signup email domain is the authoritative employer. If the email is @jci.com, the employer IS jci.com (Johnson Controls). If @comcast.net, the employer IS Comcast. Look up the domain first to confirm the company name — one search for the domain is enough. Do NOT search for this person on GitHub/LinkedIn to figure out where they work. The signup email already tells you.`,
      `COMPANY IDENTIFICATION: If the company looks like a personal Studio workspace ("[Name]'s Team", "[Name]'s Org") — use the email domain to identify the real employer. Do not research the workspace name as a company.`,
      `INTERNAL vs PRODUCT: Research this company as an engineering organization with internal systems and teams — not as a vendor. If they make dev tools (Datadog, Stripe, etc.), focus on how their own engineering teams build and operate systems, not on their product's features.`,
      ``,
      `INTEGRITY: Only include claims you actually found and can cite. A short truthful brief beats a padded one. If you found nothing specific beyond their email domain, say so.`,
      ``,
      `After your bullets, append exactly this block:`,
      `---METADATA---`,
      `{"industry":"<fintech|healthcare|saas|retail|media|logistics|defense|consulting|government|manufacturing|other>","headcount":"<1-10|11-50|51-200|201-1000|1000+|unknown>","companyType":"<startup|scaleup|enterprise|consultancy|government|nonprofit|unknown>"}`,
    ].filter(Boolean).join("\n"),
  }];
}

// ── Omni signal interpreter ───────────────────────────────────────────────────
// Converts the dot-separated extraContext string into LLM-friendly signal descriptions.
// Each bullet explains WHAT the signal is and WHY it matters for the pitch.

function parseExtraContextForLLM(extraContext) {
  if (!extraContext) return null;
  const parts = extraContext.split(" · ");
  const lines = [];

  for (const part of parts) {
    const tierMatch = part.match(/^Tier:\s*(\S+)/i);
    if (tierMatch) {
      const tier = tierMatch[1].toUpperCase();
      const desc = {
        FREE: "Free plan — evaluating or casual usage. Intent varies; treat as lighter prospect unless other signals are strong.",
        DEVELOPER: "Developer plan — active development. Approaching production, natural upgrade candidate.",
        TEAM: "Team plan — paid, collaborative. Real commitment; pitch governance and scale features.",
        BUSINESS: "Business plan — paid, org-scale. Established GraphOS user; pitch enterprise and advanced features.",
        ENTERPRISE: "Enterprise plan — top tier. Focus on expansion, professional services, or strategic alignment.",
      }[tier] || `${tier} plan`;
      lines.push(`• Subscription tier: ${tier} — ${desc}`);
      continue;
    }

    if (/^Router:\s*yes/i.test(part)) {
      lines.push(`• Using Apollo Router: YES — they are running or actively building with Apollo Router (Federation prerequisite). Hook on Router capabilities, performance, or federation benefits.`);
      continue;
    }

    const fedMatch = part.match(/^(\d+)\s+federated\s+graph/i);
    if (fedMatch) {
      const n = parseInt(fedMatch[1]);
      lines.push(`• Federated graphs: ${n} — significant Federation investment. ${n > 1 ? `Multiple graphs = distributed teams or domains; governance and schema management pain is likely.` : `Single federated graph — early Federation adopter.`}`);
      continue;
    }

    const subgraphMatch = part.match(/^(\d+)\s+subgraph/i);
    if (subgraphMatch) {
      const n = parseInt(subgraphMatch[1]);
      lines.push(`• Subgraphs: ${n} — schema split across ${n} service${n !== 1 ? "s" : ""}. ${n >= 5 ? "Complex graph topology — governance, schema checks, and breaking change detection are high-value." : "Early-stage federation setup."}`);
      continue;
    }

    const usersMatch = part.match(/^([\d,]+)\s+active\s+user/i);
    if (usersMatch) {
      const n = parseInt(usersMatch[1].replace(/,/g, ""));
      lines.push(`• Active users (last 30d): ${n} — ${n >= 20 ? "substantial team adoption; pitch org-wide governance features" : n >= 5 ? "growing team; collaboration features relevant" : "small team or solo use"}.`);
      continue;
    }

    if (/req\/mo/i.test(part)) {
      const isMillion = /M\s*req/i.test(part);
      lines.push(`• Request volume: ${part} — ${isMillion ? "production-scale traffic. This is a serious production deployment — lead with reliability, performance, and enterprise SLAs." : "moderate traffic. Active but not yet at scale."}`);
      continue;
    }

    if (/^Router\s+active\s+last\s+7d/i.test(part)) {
      lines.push(`• Router active last 7 days: YES — real traffic is flowing through Router right now. This is a live production signal, not just setup activity.`);
      continue;
    }

    if (/^Schema\s+Checks:\s*yes/i.test(part)) {
      lines.push(`• Schema Checks: ENABLED — they are using schema validation in CI/CD (a paid GraphOS feature). They value safe schema evolution; governance and breaking change tooling are high-relevance topics.`);
      continue;
    }

    if (/^Connectors:\s*yes/i.test(part)) {
      lines.push(`• Apollo Connectors: ENABLED — wrapping REST APIs as subgraphs without custom resolvers. They are actively using this feature; you can reference it directly in the email.`);
      continue;
    }

    const proposalMatch = part.match(/^(\d+)\s+proposal/i);
    if (proposalMatch) {
      const n = parseInt(proposalMatch[1]);
      lines.push(`• Schema Proposals (last 30d): ${n} — active schema governance workflow. ${n >= 3 ? "High proposal volume = collaborative schema process in place; governance tooling is very relevant." : "Schema proposals in use."}`);
      continue;
    }

    if (/^Persisted\s+Queries/i.test(part)) {
      const pqMatch = part.match(/([\d,]+)\s+ops/i);
      const opsStr = pqMatch ? `${pqMatch[1]} operations` : "operations";
      lines.push(`• Persisted Queries: ${opsStr} last 30d — using PQ for security and performance in production. Live production feature usage.`);
      continue;
    }

    const explorerMatch = part.match(/^Explorer:\s*(.+)/i);
    if (explorerMatch) {
      lines.push(`• Last Explorer query: ${explorerMatch[1]} — recently active in Apollo Explorer. Platform engagement is current.`);
      continue;
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

// ── Draft prompt ──────────────────────────────────────────────────────────────

const KNOWN_SI_NAMES = new Set([
  "accenture", "deloitte", "infosys", "tata consultancy services", "tcs",
  "wipro", "cognizant", "capgemini", "hcl", "hcl technologies",
  "tech mahindra", "mphasis", "hexaware", "ltimindtree", "lti",
  "mindtree", "persistent systems", "niit technologies", "syntel",
  "dxc technology", "unisys", "atos", "ntt data", "fujitsu",
  "ibm consulting", "kpmg", "pwc", "ey", "ernst & young",
  "booz allen hamilton", "leidos", "saic", "thoughtworks",
  "slalom", "publicis sapient", "sapient", "globant", "epam",
  "endava", "softserve", "luxoft", "virtusa", "happiest minds",
  "zensar", "cyient", "mastech", "igate",
]);

const INDIA_CITIES = ["bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune", "chennai", "kolkata", "noida", "gurgaon", "gurugram", "ahmedabad"];

// Matches "[anything]'s Team", "[anything]'s Org", "[username]'s Workspace", etc.
const PERSONAL_WORKSPACE_RE = /^.+?'s\s+(Team|Org|Workspace|Studio|Sandbox|Space|Account)$/i;
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com",
  "me.com","mac.com","live.com","msn.com","aol.com","protonmail.com","pm.me","hey.com",
]);

// Resolve effective company name and a warning note for personal workspaces
function resolveCompany(lead, account) {
  if (!PERSONAL_WORKSPACE_RE.test(account.company ?? "")) {
    return { company: account.company, note: null };
  }
  const emailDomain = lead.email?.split("@")[1]?.toLowerCase() ?? "";
  const isPersonalEmail = PERSONAL_EMAIL_DOMAINS.has(emailDomain);
  if (!isPersonalEmail && emailDomain) {
    // Corporate email → employer is CONFIRMED by the signup email domain, no searching needed
    return {
      company: emailDomain,
      note: `EMPLOYER CONFIRMED BY SIGNUP EMAIL: This person signed up with @${emailDomain}. That domain IS their employer — do not search for their company elsewhere. Look up ${emailDomain} to identify the company name, then research that company. The Studio org "${account.company}" is a personal workspace name — never use it in the email.`,
    };
  }
  // Personal email + personal workspace → unknown employer
  return {
    company: null,
    note: `IDENTITY NOTE: The Studio org "${account.company}" is a personal workspace, not a real company. This person uses a personal email — their real employer is unknown. Do not address them as if they represent a named company. Instead, ask what they are building or where they work.`,
  };
}

function buildDraftPrompt(lead, account, researchSummary, rules, emailStrategy, examples = []) {
  const rulesText = rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

  const emailExamples = examples.filter(e => e.field === "emailDraft");
  const linkedinExamples = examples.filter(e => e.field === "linkedinNote");
  const fewShotBlock = [
    emailExamples.length > 0 && [
      `STYLE EXAMPLES (what this rep prefers — use as voice reference):`,
      ...emailExamples.map((e, i) => `[${i + 1}] Feedback given: "${e.feedback}"\nResult: ${e.after}`),
    ].join("\n"),
    linkedinExamples.length > 0 && [
      `LINKEDIN STYLE EXAMPLES:`,
      ...linkedinExamples.map((e, i) => `[${i + 1}] Feedback: "${e.feedback}"\nResult: ${e.after}`),
    ].join("\n"),
  ].filter(Boolean).join("\n\n");

  // Special mode detection
  const tier = lead.extraContext?.match(/Tier:\s*(\S+)/i)?.[1]?.toUpperCase() ?? null;
  const isConsultancy = account.companyType === "consultancy" || KNOWN_SI_NAMES.has(account.company?.toLowerCase());
  const locationStr = (lead.extraContext?.match(/Location:\s*([^·\n]+)/i)?.[1] ?? "").toLowerCase();
  const hqStr = (account.hq ?? "").toLowerCase();
  const isIndia = !isConsultancy && (
    locationStr.includes("india") || INDIA_CITIES.some(c => locationStr.includes(c)) ||
    hqStr.includes("india") || INDIA_CITIES.some(c => hqStr.includes(c))
  );

  const specialMode = isConsultancy
    ? `SPECIAL MODE — CONSULTANCY/SI: Write a short generic email (under 60 words). Acknowledge the signup, note that consultants use Apollo Federation across client engagements, offer a quick call about supporting their client work. Do not reference the SI's own tech stack.`
    : isIndia
    ? `SPECIAL MODE — OFFSHORE/INDIA: Write a short practical email (under 60 words). Focus on helping them get more from their current plan and what they unlock at the next tier (Schema Checks, better governance). Developer-friendly tone. No strategic executive pitch.`
    : tier === "DEVELOPER"
    ? `TIER CONTEXT: Developer plan — active intent. Focus on what's limiting them now and position the upgrade as the natural next step.`
    : tier === "FREE"
    ? `TIER CONTEXT: Free plan — intent varies. If the research shows real signals, treat as a serious prospect. If signals are weak, keep it lighter and curiosity-driven.`
    : null;

  const { company: effectiveCompany, note: workspaceNote } = resolveCompany(lead, account);
  const prospectLine = effectiveCompany
    ? `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} at ${effectiveCompany}`
    : `PROSPECT: ${lead.name}${lead.title ? `, ${lead.title}` : ""} — employer unknown`;

  const productSignals = parseExtraContextForLLM(lead.extraContext);

  const content = [
    `You are writing a sales email for an Apollo GraphQL rep. Return ONLY valid JSON:`,
    `{"email_subject":"...","email_body":"...","linkedin_message":"..."}`,
    ``,
    APOLLO_PRODUCT_CONTEXT,
    ``,
    `STRATEGY:\n${emailStrategy}`,
    ``,
    specialMode ?? "",
    ``,
    `INTEL BRIEFING (everything Claude found about this prospect and company):\n${researchSummary || "No research available."}`,
    ``,
    productSignals
      ? `PRODUCT USAGE SIGNALS (what this person is actually doing inside GraphOS — use these to write a specific, accurate email):\n${productSignals}`
      : "",
    ``,
    prospectLine,
    workspaceNote ?? "",
    lead.linkedinUrl ? `LinkedIn: ${lead.linkedinUrl}` : "",
    account.sourcedVia ? `Note: ${account.sourcedVia} is an outsourced vendor for ${effectiveCompany ?? account.company}. Address as practitioner, not decision-maker.` : "",
    lead.visitedUrls ? `\nPAGES VISITED ON APOLLO.IO:\n${lead.visitedUrls}` : "",
    account.accountNotes ? `\nACCOUNT NOTES: ${account.accountNotes}` : "",
    fewShotBlock ? `\n${fewShotBlock}` : "",
    ``,
    `HOW MUCH TO WRITE — choose based on what the intel briefing actually contains:`,
    `• Rich intel (specific exec quote, confirmed tech usage, earnings signal, high-intent page visit like /enterprise or /federation): 100-150 words. Lead hard with the best hook. Make it obvious you did your homework.`,
    `• Decent context (industry, company scale, domain) but no specific hook: 80-120 words. Ground the email in their business reality. Ask a genuine question about what they are solving. Do not invent specifics.`,
    `• Sparse (nothing beyond email domain and signup): under 60 words. Acknowledge the signup, ask one open question, offer a call. Nothing fabricated.`,
    ``,
    `Pages visited on apollo.io are always a valid hook — if they visited /federation, /enterprise, /pricing, /schema-checks, or any product page, reference it directly.`,
    `PRODUCT SIGNALS ARE GROUND TRUTH: The product usage signals above come directly from the platform database — they are facts, not inferences. If it says "Router: yes", they ARE using Router. If it says "3 federated graphs", they HAVE 3 federated graphs. Reference these directly and specifically in the email — they are the strongest hook you have. If signals show Schema Checks, Connectors, or Persisted Queries, those are live features the prospect is actively using right now.`,
    ``,
    `WRITING RULES — follow every one precisely:`,
    rulesText,
    ``,
    `FORBIDDEN EMAIL OPENERS — these are hard disqualifiers. If your draft opens with any of these, rewrite it before returning:`,
    `  ✗ Any sentence starting with "I noticed..."`,
    `  ✗ Any sentence starting with "I saw..."`,
    `  ✗ Any sentence starting with "I wanted to reach out..." / "I'm reaching out because..."`,
    `  ✗ Any sentence starting with "I came across..."`,
    `  ✗ "Hope this finds you..." / "My name is X from Apollo..."`,
    `  ✗ "Congratulations on..." / "Thanks for signing up..."`,
    `  ✗ Any opener that references the signup act itself ("you recently signed up", "you set up an account")`,
    `The email_body must open with the hook, a question, or a direct statement about their situation — not about how you found them.`,
    ``,
    `INTEGRITY — these override everything:`,
    `• Never invent a specific technical claim (endpoint, repo, integration, architecture detail) that is not in the intel briefing.`,
    `• Never state they "are using" or "have implemented" something you did not find evidence of.`,
    `• NEVER name the prospect's own company as a customer reference or social proof example. If Lawrence works at MASA, do not write "Companies like MASA use GraphOS." That is the company you are pitching to, not a customer reference.`,
    `• Never use an Apollo customer as generic social proof. Only cite a customer if the briefing gives a specific reason it is relevant to this prospect's situation.`,
    `• Using their industry, company scale, and business context is allowed and expected. Inventing specifics is not.`,
  ].filter(s => s !== null && s !== undefined).join("\n");

  return [{ role: "user", content }];
}

function parseResearchOutput(text) {
  const parts = text.split(/---METADATA---/i);
  const summary = parts[0].trim();
  let metadata = null;
  if (parts[1]) {
    try {
      const match = parts[1].trim().match(/\{[\s\S]*?\}/);
      if (match) metadata = JSON.parse(match[0]);
    } catch {}
  }
  return { summary, metadata };
}

async function callClaude(apiKey, messages) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function callClaudeWithSearch(apiKey, messages) {
  const makeCall = (msgs) => fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: msgs,
    }),
    signal: AbortSignal.timeout(60000),
  }).then(async r => {
    if (!r.ok) throw new Error(`Anthropic API error ${r.status}: ${await r.text()}`);
    return r.json();
  });

  let data = await makeCall(messages);

  if (data.stop_reason === "tool_use") {
    const toolResults = data.content
      .filter(b => b.type === "tool_use")
      .map(b => ({ type: "tool_result", tool_use_id: b.id, content: b.content ? JSON.stringify(b.content) : "No results" }));
    data = await makeCall([
      ...messages,
      { role: "assistant", content: data.content },
      { role: "user", content: toolResults },
    ]);
  }

  return data;
}

function extractText(res) {
  return res.content?.filter(b => b.type === "text").map(b => b.text).join("") ?? "";
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try { return JSON.parse(match[0]); } catch { return {}; }
}
