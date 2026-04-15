import { describe, it, expect } from "vitest";

// Inline the priority map from app/api/queue/route.js
const PRIORITY = {
  webinar: 0,
  web_visit: 1,
  job_posting: 2,
  customer_expansion: 3,
  github_download: 4,
  other: 5,
  manual_entry: 6,
};

function sortLeads(leads) {
  return [...leads].sort((a, b) => {
    const pa = PRIORITY[a.signalType] ?? 5;
    const pb = PRIORITY[b.signalType] ?? 5;
    if (pa !== pb) return pa - pb;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

describe("queue signal priority sort", () => {
  it("sorts webinar leads before web_visit", () => {
    const leads = [
      { id: "1", signalType: "web_visit", createdAt: "2026-04-01" },
      { id: "2", signalType: "webinar", createdAt: "2026-04-01" },
    ];
    const sorted = sortLeads(leads);
    expect(sorted[0].id).toBe("2");
  });

  it("sorts job_posting after web_visit", () => {
    const leads = [
      { id: "1", signalType: "job_posting", createdAt: "2026-04-01" },
      { id: "2", signalType: "web_visit", createdAt: "2026-04-01" },
    ];
    expect(sortLeads(leads)[0].id).toBe("2");
  });

  it("treats unknown signalType as priority 5 (same as 'other')", () => {
    const leads = [
      { id: "1", signalType: "unknown_type", createdAt: "2026-04-01" },
      { id: "2", signalType: "github_download", createdAt: "2026-04-01" },
    ];
    // unknown defaults to 5, github_download is 4 — github should come first
    expect(sortLeads(leads)[0].id).toBe("2");
  });

  it("within same signal type, sorts newer leads first", () => {
    const leads = [
      { id: "1", signalType: "web_visit", createdAt: "2026-03-01" },
      { id: "2", signalType: "web_visit", createdAt: "2026-04-01" },
    ];
    expect(sortLeads(leads)[0].id).toBe("2");
  });

  it("manual_entry sorts last among all types", () => {
    const leads = [
      { id: "1", signalType: "manual_entry", createdAt: "2026-04-01" },
      { id: "2", signalType: "github_download", createdAt: "2026-04-01" },
      { id: "3", signalType: "other", createdAt: "2026-04-01" },
    ];
    const sorted = sortLeads(leads);
    expect(sorted[sorted.length - 1].id).toBe("1");
  });
});
