// lib/apollo-context.js
//
// Apollo product knowledge injected into every Claude outreach prompt.
// Keep this accurate and current — stale product knowledge produces bad emails.
// Last updated: April 2026. Source: Apollo GraphQL official docs via MCP.

export const APOLLO_PRODUCT_CONTEXT = `
## Apollo GraphQL — What We Sell and Why It Matters

### The Platform: Apollo GraphOS
GraphOS is Apollo's supergraph platform. It combines three things into one managed system:
- **Schema Registry** — single source of truth for your GraphQL schema across all teams and services
- **GraphOS Router** — a self-hosted, Rust-based request router that replaces Apollo Gateway. Dramatically faster and more resource-efficient. Fetches the composed supergraph schema automatically from Apollo Uplink.
- **GraphOS Studio** — web UI for schema management, operation explorer, performance insights, and governance

### Apollo Federation
Federation lets large engineering orgs break a single GraphQL API into independently owned subgraphs — each team owns their slice of the schema. GraphOS composes them into one unified supergraph. The key value: teams ship independently without breaking the shared API.

### Apollo Connectors (newest product)
Connectors let teams wrap existing REST APIs into GraphQL with zero additional server code. You define the mapping in your GraphQL schema + a YAML router config file. No new service to deploy. This is the fastest path from REST to GraphQL for teams that don't want to rewrite backends.

### GraphOS Studio Features (used daily by devs)
- **Schema Checks** — catch breaking changes before they ship; integrates into CI/CD pipelines
- **Schema Linting** — enforce naming and design standards automatically across all subgraphs
- **Schema Proposals** — change management workflow: suggest, review, approve schema changes before they go live
- **Contracts** — deliver different subsets of the supergraph to different consumers (internal vs. external, mobile vs. web)
- **Explorer** — interactive GraphQL IDE inside Studio for exploring the full supergraph
- **Apollo Sandbox** — free local dev mode, no account required, loads schema via introspection

### Observability
Router reports operation metrics, field usage, and traces to GraphOS Studio automatically. Integrates with OpenTelemetry, Zipkin, Grafana. Teams get field-level insights — which fields are used, by whom, how often — without any instrumentation code.

### Plans and Licensing
- **Free plan** — self-serve sign-up at studio.apollographql.com. Includes Router, Studio, Connectors, schema checks.
- **Standard plan** — requires talking to an Apollo rep. Adds team features and more graph operations.
- **Enterprise plan** — requires Apollo rep. Adds: offline router licenses (for air-gapped or disconnected environments), schema auth/authorization directives in the schema itself, external coprocessing (hook any language into the router request lifecycle), persisted queries for operation safelisting, advanced access control.

The Router license is fetched from Apollo Uplink at startup and stays valid through the billing period. Enterprise offline licenses are for orgs that can't maintain a live connection to GraphOS (air-gapped networks, defense, regulated industries).

### URGENT — Cloud Plan Sunset (Critical for Existing Customers)
Apollo is discontinuing Serverless and Dedicated cloud-hosted router plans:
- **Serverless plans end February 1, 2026** — cloud routers unavailable after February 15, 2026
- **Dedicated plans end March 15, 2026**
Any prospect currently on Serverless or Dedicated MUST migrate to self-hosted Router. This is an active forcing function. If a prospect is on either plan, lead with migration support as the entry point.

### Common Buying Signals to Reference in Outreach
- Team has multiple REST APIs and wants one unified GraphQL layer → Connectors
- Engineering org has grown and multiple teams share one GraphQL API → Federation + GraphOS
- Breaking schema changes are causing incidents → Schema Checks + Schema Proposals
- Platform team wants governance over 5+ subgraph teams → GraphOS Studio + Contracts
- Company in regulated/defense/air-gapped environment → Enterprise offline license
- Currently on Serverless or Dedicated plan → urgent migration to self-hosted Router
- Team evaluating GraphQL for the first time → Free plan + Studio Sandbox + Connectors quickstart

### What Apollo Is NOT
- Not a REST API gateway (though Router can proxy REST via Connectors)
- Not a general API management tool (Apigee, Kong) — specifically GraphQL
- Not a backend framework — Apollo Client is the frontend/client SDK, Apollo Server/Router is infrastructure

### Sales Strategy — Rep Intent and Goals

**Primary goal of every outreach: book an intro call.** Not to close a deal, not to pitch every feature — just to earn a 20-minute conversation. The email and LinkedIn message should create enough curiosity and relevance to get a reply. One specific hook, one clear ask.

**By tier:**

- **Developer plan**: Highest intent. These orgs are actively using GraphOS and have made a deliberate choice to invest in the platform. Outreach should focus on what's holding them back from scaling — team growth, federation complexity, governance, or the Serverless/Dedicated sunset. Position Standard or Enterprise as the natural next step, not a sales push.

- **Free plan**: More variable. Many are evaluating, kicking tires, or small teams that will never spend. Look for signals that suggest real organizational scale: company size, industry, number of subgraphs or active users, request volume, or job signals indicating a growing API/platform team. If those signals are weak, deprioritize. If strong, treat similarly to Developer — but lead with the value they're missing, not the upgrade.

**Hidden org detection — important:**
Some orgs sign up under a generic team name (e.g. "Platform Team", "API Gateway", "GraphQL Infra", "Dev Tools") that obscures their true parent company. When researching, always look for clues that the Studio org name is an internal team name at a much larger corporation. Signals: corporate email domain, large headcount, enterprise industry vertical, Salesforce account name differs from Studio org name. If detected, flag it in the research summary — the email should address the actual company, not the internal team name.

**Tone and structure:**
- Lead with something specific to them — a signal, a product behavior, a public announcement — not a generic opener
- One insight → one implication → one ask (the call)
- Never pitch more than one product feature
- Never use hollow phrases: "I wanted to reach out", "I hope this finds you well", "I thought you might be interested"
- Short is better — 4-6 sentences for email body, 2-3 for LinkedIn

### VERIFIED APOLLO CUSTOMERS — Reference List
**CRITICAL: Only mention Apollo customers from this exact list. Never fabricate, guess, or infer customer references. If no customer on this list is a strong fit for the prospect's industry or use case, omit customer references entirely rather than hallucinate one.**

Joby Aviation, Onxmaps, Volkswagen Group Of America, Cox Automotive, Rivian Automotive, EVgo, Ford, Cummins, Poppulo, TripleLift, Expeditors International, Autodesk Construction Cloud, S&P Global, Health & Safety Institute, AUDI AG, Restoration Hardware, VelocityEHS, O.C. Tanner, Transport for NSW, Glady, Pella Corporation, Hilti Corporation, Burberry Ltd, Fabletics Inc, Christian Dior Couture, Custom Ink, Preply, Care.com, Walmart, Procter & Gamble, Viator, Nintendo Of America, Expedia, EF Education First, HelloFresh, Booking Holdings Inc., HEINEKEN Global Shared Services, Strava, Kmart Australia Limited, U-NEXT, Lensrentals.com, Varsity Tutors, Parchment, Encoura, National Grid, Fortum, Alberta Energy Regulator, LichtBlick SE, Santander Bank, Liberty Mutual Insurance, State Farm, Humana, Edward Jones, Capital One, JPMorgan Chase & Co., Northwestern Mutual, Royal Bank Of Canada, Vanguard Group, Brex, Remitly, Kiwibank, GoodLeap, Gusto, Experian, Block, National Australia Bank, Coinbase, Fidelity Investments, Medica, CupoNation GmbH, Arab African International Bank, BCP, OneMain General Services Corporation, GoHealth, U.S. Bank National Association, Delaware Life Insurance Company, Northern Trust Corporation, Cambia Health Solutions, Principal Financial Group, Thrivent Financial for Lutherans, Varo Money, DivvyPay LLC, Included Health, Vitality, Fenergo, Sainsbury's, WooliesX, Starbucks Corporation, Yum! Brands, Ahold Delhaize, Sysco, Crumbl Cookies, Provi, Modern Health, Athenahealth, Ascension Healthcare Corporation, Optum, Dasa, CVS Health, GrandVision, GoodRx, Whitbread, Trivago, MGM Resorts International, The Pokémon Company International, Peloton Interactive, Marriott International, Hyatt Hotels Corporation, FCM Travel, John Deere, Apple, The New York Times, Warner Bros Discovery, The Walt Disney Company, Ticketmaster, Netflix, Sony Group, Dow Jones, TV 2 Denmark, CBC Cologne Broadcasting Center, Globo.com, Abbvie, Baxter Healthcare Corporation, StudyKIK, Domain, Fannie Mae, Move, Redfin, Smart Service Queensland, Keller Williams Realty, PokerStars, NBA, Jumbo Supermarkten, Selfridges Retail Limited, IHG Hotels & Resorts, PETCO, Sephora, Stitch Fix, H-E-B, SSENSE, On Running, Philip Morris International, Wayfair, Nutrien, Zumiez, RONA, Wood Mackenzie, Allergan Data Labs, Red Hat, N-able, CoverMyMeds, CS Disco, SmartHR, Coolblue, Ricoh Europe, MLB, theScore, Mojo Interactive, Lattice, SecureWorks, Snap, Riot Games, Pocket, NetApp, The Trade Desk, Thinkific, Pinterest, Indeed, DoorDash, Adobe, Zendesk, PayPal, Zillow Group, Intuit, SurveyMonkey, Atlassian, Zapier, Yahoo, Shipt, Wiz, Condé Nast, Dell Technologies, Thrive Global, QVC, monday.com, GetYourGuide, Priceline.com, Booking.com, AlphaSense, Pandora, Ezcater, Doximity, Mindbody, Salsify, Sendoso, RS Components, Sonepar, AT&T, T-Mobile, Charter Communications, Flexport, American Airlines, DAT Solutions, Delivery Hero
`.trim();
