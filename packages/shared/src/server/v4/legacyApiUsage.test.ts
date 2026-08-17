import { describe, expect, it } from "vitest";
import {
  V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
  v4LegacyApiHourBucketTtlSeconds,
} from "./legacyApiUsage";

describe("v4LegacyApiHourBucketTtlSeconds", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const nowMs = Date.parse("2026-06-25T00:30:00.000Z");

  it("gives nearly the full GC horizon for the current hour", () => {
    const hourStartMs = Date.parse("2026-06-25T00:00:00.000Z");
    const ttl = v4LegacyApiHourBucketTtlSeconds(hourStartMs, nowMs);
    expect(ttl).toBe(
      V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS -
        Math.floor((nowMs - hourStartMs) / 1000),
    );
  });

  it("shortens TTL for hole-repaired older hours so they expire with the window", () => {
    const tenDaysAgo = nowMs - 10 * 24 * HOUR_MS;
    const hourStartMs = Math.floor(tenDaysAgo / HOUR_MS) * HOUR_MS;
    const ttl = v4LegacyApiHourBucketTtlSeconds(hourStartMs, nowMs);
    // ~5 days remaining of the 15d horizon
    expect(ttl).toBeGreaterThan(4 * 24 * 60 * 60);
    expect(ttl).toBeLessThan(6 * 24 * 60 * 60);
  });

  it("clamps to at least 1 second when the hour is already past the horizon", () => {
    const hourStartMs = nowMs - 20 * 24 * HOUR_MS;
    expect(v4LegacyApiHourBucketTtlSeconds(hourStartMs, nowMs)).toBe(1);
  });
});
