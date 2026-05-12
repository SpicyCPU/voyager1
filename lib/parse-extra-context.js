// lib/parse-extra-context.js
//
// Converts the dot-separated extraContext string (built by omni-ingest.js) into
// LLM-readable bullet points that explain what each signal means for sales context.
// Used by generate/route.js (draft + research prompts) and chat/route.js.

export function parseExtraContextForLLM(extraContext) {
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
