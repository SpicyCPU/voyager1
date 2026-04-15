// Tests for /api/ingest/common-room
// Covers: auth, payload mapping, dedup, re-engagement, anonymous skip, error handling

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared test fixtures ──────────────────────────────────────────────────

const CONTACT_PAYLOAD = {
  payload: {
    fullName: "Jane Smith",
    primaryEmail: "jane@acme.com",
    title: "Head of Engineering",
    linkedInUrl: "https://linkedin.com/in/janesmith",
    organization: { name: "Acme Corp" },
    lastSeenWebVisitUrl: "https://apollographql.com/pricing/",
  },
  id: "webhook-uuid-1",
  source: { type: "workflow", id: 1, name: "Pricing page visit" },
};

const ACTIVITY_PAYLOAD = {
  payload: {
    activityType: "WebsiteVisit",
    serviceName: "Website",
    externalActivityUrl: "https://apollographql.com/docs/",
    member: {
      fullName: "Bob Lee",
      primaryEmail: "bob@startup.io",
      organization: { name: "Startup Inc" },
    },
    company: { name: "Startup Inc" },
  },
  id: "webhook-uuid-2",
  source: { type: "workflow", id: 2, name: "Docs visit" },
};

const GITHUB_ACTIVITY_PAYLOAD = {
  payload: {
    activityType: "GitHubStarred",
    serviceName: "GitHub",
    member: {
      fullName: "Ali Hassan",
      primaryEmail: "ali@devco.com",
      organization: { name: "DevCo" },
    },
    company: { name: "DevCo" },
  },
  id: "webhook-uuid-3",
  source: { type: "workflow", id: 3, name: "GitHub star" },
};

const ANONYMOUS_ORG_PAYLOAD = {
  payload: {
    name: "BigCorp",
    domain: "bigcorp.com",
    lastSeenWebVisitUrl: "https://apollographql.com/enterprise/",
  },
  id: "webhook-uuid-4",
  source: { type: "workflow", id: 4, name: "Anonymous visit" },
};

// ─── Mock DB ──────────────────────────────────────────────────────────────

// We test the route logic in isolation by mocking the db module.
// The db mock is configured per-test using mockFindFirst / mockInsert / mockUpdate helpers.

let mockAccountFindFirst = vi.fn();
let mockLeadFindFirst = vi.fn();
let mockAccountInsert = vi.fn();
let mockLeadInsert = vi.fn();
let mockLeadUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      accounts: { findFirst: (...args) => mockAccountFindFirst(...args) },
      leads:    { findFirst: (...args) => mockLeadFindFirst(...args) },
    },
    insert: (table) => ({
      values: (vals) => ({
        returning: () => {
          const name = table?._.name ?? "";
          if (name === "Account" || JSON.stringify(table).includes("Account")) {
            return mockAccountInsert(vals);
          }
          return mockLeadInsert(vals);
        },
      }),
    }),
    update: () => ({
      set: (vals) => ({
        where: () => ({
          returning: () => mockLeadUpdate(vals),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/schema", () => ({
  accounts: { _: { name: "Account" } },
  leads:    { _: { name: "Lead" } },
}));

// Helper: build a NextRequest-like object
function makeRequest(body, secret = "test-secret", headers = {}) {
  return {
    headers: {
      get: (key) => {
        if (key === "x-commonroom-webhook-secret") return headers["x-commonroom-webhook-secret"] ?? secret;
        return null;
      },
    },
    json: async () => body,
  };
}

// ─── Import route after mocks ─────────────────────────────────────────────

const { POST } = await import("../app/api/ingest/common-room/route.js");

// ─── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/ingest/common-room", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("INGEST_SECRET", "test-secret");
    mockAccountFindFirst.mockReset();
    mockLeadFindFirst.mockReset();
    mockAccountInsert.mockReset();
    mockLeadInsert.mockReset();
    mockLeadUpdate.mockReset();
  });

  // ── Auth ─────────────────────────────────────────────────────────────

  it("returns 401 when secret header is missing", async () => {
    const req = makeRequest(CONTACT_PAYLOAD, null, { "x-commonroom-webhook-secret": "" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret header is wrong", async () => {
    const req = makeRequest(CONTACT_PAYLOAD, "wrong-secret");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when INGEST_SECRET env var is not set", async () => {
    vi.stubEnv("INGEST_SECRET", "");
    const req = makeRequest(CONTACT_PAYLOAD);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── Error handling ────────────────────────────────────────────────────

  it("returns 400 for malformed JSON body", async () => {
    const req = {
      headers: { get: () => "test-secret" },
      json: async () => { throw new SyntaxError("Unexpected token"); },
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 when payload field is missing", async () => {
    const req = makeRequest({ id: "abc" }); // no payload
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Contact payload — new lead ────────────────────────────────────────

  it("creates a new lead from a contact payload", async () => {
    mockAccountFindFirst.mockResolvedValue(null);
    mockAccountInsert.mockResolvedValue([{ id: "acc-1", company: "Acme Corp" }]);
    mockLeadFindFirst.mockResolvedValue(null);
    mockLeadInsert.mockResolvedValue([{
      id: "lead-1", name: "Jane Smith", email: "jane@acme.com",
      signalType: "web_visit", signalHistory: JSON.stringify([{}]), lastSignalAt: new Date().toISOString(),
    }]);

    const req = makeRequest(CONTACT_PAYLOAD);
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.action).toBe("created");
    expect(mockLeadInsert).toHaveBeenCalledOnce();
    const insertedLead = mockLeadInsert.mock.calls[0][0];
    expect(insertedLead.name).toBe("Jane Smith");
    expect(insertedLead.email).toBe("jane@acme.com");
    expect(insertedLead.signalType).toBe("web_visit");
    expect(insertedLead.lastSignalAt).toBeTruthy();
    const history = JSON.parse(insertedLead.signalHistory);
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe("web_visit");
  });

  // ── Activity payload — GitHub signal type ─────────────────────────────

  it("maps GitHub serviceName to github_download signal type", async () => {
    mockAccountFindFirst.mockResolvedValue({ id: "acc-2", company: "DevCo" });
    mockLeadFindFirst.mockResolvedValue(null);
    mockLeadInsert.mockResolvedValue([{ id: "lead-2", name: "Ali Hassan", signalType: "github_download" }]);

    const req = makeRequest(GITHUB_ACTIVITY_PAYLOAD);
    await POST(req);

    const insertedLead = mockLeadInsert.mock.calls[0][0];
    expect(insertedLead.signalType).toBe("github_download");
  });

  // ── Deduplication — update existing lead ──────────────────────────────

  it("updates an existing lead instead of creating a duplicate", async () => {
    const existingLead = {
      id: "lead-existing",
      email: "jane@acme.com",
      accountId: "acc-1",
      outreachStatus: "draft",
      signalHistory: JSON.stringify([{ type: "web_visit", url: "https://apollographql.com/", source: "common_room", timestamp: "2026-04-06T10:00:00Z" }]),
      extraContext: null,
      lastSignalAt: "2026-04-06T10:00:00Z",
    };

    mockAccountFindFirst.mockResolvedValue({ id: "acc-1", company: "Acme Corp" });
    mockLeadFindFirst.mockResolvedValue(existingLead);
    mockLeadUpdate.mockResolvedValue([{ ...existingLead, lastSignalAt: new Date().toISOString() }]);

    const req = makeRequest(CONTACT_PAYLOAD);
    const res = await POST(req);
    const data = await res.json();

    expect(data.action).toBe("updated");
    expect(mockLeadInsert).not.toHaveBeenCalled();
    expect(mockLeadUpdate).toHaveBeenCalledOnce();

    // Signal history should have 2 entries now
    const updatePayload = mockLeadUpdate.mock.calls[0][0];
    const history = JSON.parse(updatePayload.signalHistory);
    expect(history).toHaveLength(2);
  });

  // ── Re-engagement — previously sent lead ──────────────────────────────

  it("appends re-engagement note to extraContext when lead is already sent", async () => {
    const sentLead = {
      id: "lead-sent",
      email: "jane@acme.com",
      accountId: "acc-1",
      outreachStatus: "sent",
      signalHistory: null,
      extraContext: "Existing context",
      lastSignalAt: null,
    };

    mockAccountFindFirst.mockResolvedValue({ id: "acc-1", company: "Acme Corp" });
    mockLeadFindFirst.mockResolvedValue(sentLead);
    mockLeadUpdate.mockResolvedValue([{ ...sentLead }]);

    const req = makeRequest(CONTACT_PAYLOAD);
    await POST(req);

    const updatePayload = mockLeadUpdate.mock.calls[0][0];
    expect(updatePayload.extraContext).toContain("Re-engagement");
    expect(updatePayload.extraContext).toContain("web_visit");
    // Re-engagement resets draftStatus to idle so rep can regenerate with fresh context
    expect(updatePayload.draftStatus).toBe("idle");
  });

  // ── Anonymous org visit ───────────────────────────────────────────────

  it("skips lead creation for anonymous org-level visit", async () => {
    const req = makeRequest(ANONYMOUS_ORG_PAYLOAD);
    const res = await POST(req);
    const data = await res.json();

    expect(data.action).toBe("skipped");
    expect(data.reason).toContain("anonymous");
    expect(mockLeadInsert).not.toHaveBeenCalled();
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });
});
