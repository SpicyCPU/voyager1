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
`.trim();
