import { describe, it, expect, beforeEach, vi } from "vitest";

// getCookieName / shouldSecureCookies read these off `env` at call time, so the
// tests mutate mockEnv.env between cases.
const mockEnv = vi.hoisted(() => ({
  env: {
    NEXTAUTH_URL: "https://example.com",
    NEXTAUTH_COOKIE_DOMAIN: undefined as string | undefined,
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
    NEXTAUTH_COOKIE_NAME_SUFFIX: undefined as string | undefined,
    VERCEL: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import { getCookieName } from "@/src/server/utils/cookies";

const BASE = "next-auth.session-token";
// Every region accepted by env.mjs's NEXT_PUBLIC_LANGFUSE_CLOUD_REGION enum.
const CLOUD_REGIONS = ["US", "EU", "STAGING", "DEV", "HIPAA", "JP"] as const;

describe("getCookieName", () => {
  beforeEach(() => {
    mockEnv.env.NEXTAUTH_URL = "https://example.com";
    mockEnv.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    mockEnv.env.NEXTAUTH_COOKIE_NAME_SUFFIX = undefined;
  });

  it("no region and no suffix -> bare secure name (unchanged self-hosted default)", () => {
    expect(getCookieName(BASE)).toBe(`__Secure-${BASE}`);
  });

  it.each(CLOUD_REGIONS)(
    "region %s -> region suffix (unchanged cloud behavior)",
    (region) => {
      mockEnv.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = region;
      expect(getCookieName(BASE)).toBe(`__Secure-${BASE}.${region}`);
    },
  );

  it("suffix with no region -> suffix applied (new self-hosted capability)", () => {
    mockEnv.env.NEXTAUTH_COOKIE_NAME_SUFFIX = "pr-1234";
    expect(getCookieName(BASE)).toBe(`__Secure-${BASE}.pr-1234`);
  });

  // The production safety guarantee: a configured region ALWAYS wins, so setting
  // NEXTAUTH_COOKIE_NAME_SUFFIX on a cloud deployment (e.g. by config mistake)
  // can never change its cookie names -> existing sessions are never invalidated.
  it.each(CLOUD_REGIONS)(
    "region %s takes precedence over an also-set suffix (never alters cloud cookies)",
    (region) => {
      mockEnv.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = region;
      mockEnv.env.NEXTAUTH_COOKIE_NAME_SUFFIX = "pr-1234";
      expect(getCookieName(BASE)).toBe(`__Secure-${BASE}.${region}`);
    },
  );

  it("non-https NEXTAUTH_URL drops the __Secure- prefix but keeps the suffix", () => {
    mockEnv.env.NEXTAUTH_URL = "http://localhost:3000";
    mockEnv.env.NEXTAUTH_COOKIE_NAME_SUFFIX = "pr-1234";
    expect(getCookieName(BASE)).toBe(`${BASE}.pr-1234`);
  });

  it("applies to every auth cookie name it is given", () => {
    mockEnv.env.NEXTAUTH_COOKIE_NAME_SUFFIX = "pr-1234";
    for (const n of [
      "next-auth.session-token",
      "next-auth.csrf-token",
      "next-auth.callback-url",
    ]) {
      expect(getCookieName(n)).toBe(`__Secure-${n}.pr-1234`);
    }
  });
});
