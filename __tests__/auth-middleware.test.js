// Tests for middleware.js auth
// Covers: unauthenticated API requests, authenticated requests, ingest bypass,
//         login route bypass, cookie validation, missing SITE_SECRET handling

import { describe, it, expect, vi, beforeEach } from "vitest";
import { proxy as middleware } from "../proxy.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(pathname, cookies = {}) {
  const url = new URL(`http://localhost${pathname}`);
  return {
    nextUrl: {
      pathname,
      clone: () => ({ pathname, toString: () => url.toString() }),
    },
    cookies: {
      get: (name) => (cookies[name] ? { value: cookies[name] } : undefined),
    },
  };
}

// Capture NextResponse calls
vi.mock("next/server", () => {
  const redirect = vi.fn((url) => ({ type: "redirect", url, headers: new Map() }));
  const json = vi.fn((body, init) => ({ type: "json", body, status: init?.status ?? 200 }));
  const next = vi.fn(() => ({ type: "next" }));
  return {
    NextResponse: { redirect, json, next },
  };
});

import { NextResponse } from "next/server";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SITE_SECRET", "test-site-secret");
  });

  describe("public routes (no auth required)", () => {
    it("allows /login through without auth", () => {
      middleware(makeRequest("/login"));
      expect(NextResponse.next).toHaveBeenCalledOnce();
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it("allows /api/auth/login through without auth", () => {
      middleware(makeRequest("/api/auth/login"));
      expect(NextResponse.next).toHaveBeenCalledOnce();
    });

    it("allows /api/auth/logout through without auth", () => {
      middleware(makeRequest("/api/auth/logout"));
      expect(NextResponse.next).toHaveBeenCalledOnce();
    });

    it("allows /api/ingest/common-room through without auth (has its own auth)", () => {
      middleware(makeRequest("/api/ingest/common-room"));
      expect(NextResponse.next).toHaveBeenCalledOnce();
    });

    it("allows /api/ingest through without auth", () => {
      middleware(makeRequest("/api/ingest"));
      expect(NextResponse.next).toHaveBeenCalledOnce();
    });
  });

  describe("API routes without session cookie", () => {
    it("returns 401 for GET /api/queue with no cookie", () => {
      middleware(makeRequest("/api/queue"));
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: "Unauthorized" },
        { status: 401 }
      );
    });

    it("returns 401 for POST /api/leads with no cookie", () => {
      middleware(makeRequest("/api/leads"));
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: "Unauthorized" },
        { status: 401 }
      );
    });

    it("returns 401 for POST /api/leads/123/generate with no cookie", () => {
      middleware(makeRequest("/api/leads/123/generate"));
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: "Unauthorized" },
        { status: 401 }
      );
    });

    it("returns 401 for DELETE /api/leads/123 with no cookie", () => {
      middleware(makeRequest("/api/leads/123"));
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: "Unauthorized" },
        { status: 401 }
      );
    });
  });

  describe("page routes without session cookie", () => {
    it("redirects / to /login with no cookie", () => {
      middleware(makeRequest("/"));
      expect(NextResponse.redirect).toHaveBeenCalledOnce();
    });

    it("redirects /review/abc to /login with no cookie", () => {
      middleware(makeRequest("/review/abc"));
      expect(NextResponse.redirect).toHaveBeenCalledOnce();
    });
  });

  describe("authenticated requests", () => {
    it("allows /api/queue through with valid session cookie", () => {
      middleware(makeRequest("/api/queue", { v1_session: "test-site-secret" }));
      expect(NextResponse.next).toHaveBeenCalledOnce();
      expect(NextResponse.json).not.toHaveBeenCalled();
    });

    it("allows / through with valid session cookie", () => {
      middleware(makeRequest("/", { v1_session: "test-site-secret" }));
      expect(NextResponse.next).toHaveBeenCalledOnce();
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it("returns 401 for API route with wrong cookie value", () => {
      middleware(makeRequest("/api/queue", { v1_session: "wrong-secret" }));
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: "Unauthorized" },
        { status: 401 }
      );
    });
  });

  describe("missing SITE_SECRET", () => {
    beforeEach(() => {
      vi.stubEnv("SITE_SECRET", "");
    });

    it("returns 503 for API routes when SITE_SECRET not configured", () => {
      middleware(makeRequest("/api/queue"));
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: "Server misconfigured: SITE_SECRET not set" },
        { status: 503 }
      );
    });

    it("redirects page routes to /login when SITE_SECRET not configured", () => {
      middleware(makeRequest("/"));
      expect(NextResponse.redirect).toHaveBeenCalledOnce();
    });
  });
});
