import { describe, it, expect } from "vitest";
import { isOrgPastOtelDirectWriteCutoff } from "@/src/features/public-api/server/otelDirectWriteCutoff";

describe("isOrgPastOtelDirectWriteCutoff", () => {
  const cutoff = "2026-08-06";
  const inScope = {
    orgCreatedAt: "2026-08-07T09:00:00.000Z",
    cutoff,
    isLangfuseCloud: true,
  };

  it("includes organizations created after the cutoff", () => {
    expect(isOrgPastOtelDirectWriteCutoff(inScope)).toBe(true);
  });

  it("includes organizations created exactly at midnight UTC on the cutoff date", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({
        ...inScope,
        orgCreatedAt: "2026-08-06T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("excludes organizations created just before the cutoff date", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({
        ...inScope,
        orgCreatedAt: "2026-08-05T23:59:59.999Z",
      }),
    ).toBe(false);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({
        ...inScope,
        orgCreatedAt: new Date("2026-08-07T09:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isOrgPastOtelDirectWriteCutoff({
        ...inScope,
        orgCreatedAt: new Date("2026-08-05T09:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("is disabled when the cutoff is unset", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({ ...inScope, cutoff: undefined }),
    ).toBe(false);
  });

  it("is disabled off Cloud even with a cutoff configured", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({ ...inScope, isLangfuseCloud: false }),
    ).toBe(false);
  });

  // A cache entry written before orgCreatedAt existed must not be read as
  // "created at epoch" (in scope for no cutoff) nor as "created now" (in scope
  // for every cutoff) — it has to fall back to the pre-cutoff behaviour.
  it("falls back to the pre-cutoff behaviour when the org date is unknown", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({ ...inScope, orgCreatedAt: null }),
    ).toBe(false);
    expect(
      isOrgPastOtelDirectWriteCutoff({ ...inScope, orgCreatedAt: undefined }),
    ).toBe(false);
  });

  it("falls back to the pre-cutoff behaviour on unparseable dates", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({
        ...inScope,
        orgCreatedAt: "not-a-date",
      }),
    ).toBe(false);
    expect(
      isOrgPastOtelDirectWriteCutoff({ ...inScope, cutoff: "not-a-date" }),
    ).toBe(false);
  });
});
