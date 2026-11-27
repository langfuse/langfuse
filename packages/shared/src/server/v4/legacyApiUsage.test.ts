import { describe, expect, it } from "vitest";
import {
  aggregateV4LegacyApiHourBuckets,
  MAX_V4_LEGACY_API_CALLERS_PER_ENDPOINT,
  mergeV4LegacyApiCallers,
  V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
  v4LegacyApiHourBucketTtlSeconds,
} from "./legacyApiUsage";

describe("mergeV4LegacyApiCallers", () => {
  it("bounds caller cardinality and preserves the overflow total", () => {
    const callers = Array.from({ length: 25 }, (_, index) => ({
      userAgent: `caller-${index}`,
      count: index + 1,
      lastSeen: `2026-07-23T${String(index % 24).padStart(2, "0")}:00:00Z`,
    }));

    const merged = mergeV4LegacyApiCallers(callers);

    expect(merged).toHaveLength(MAX_V4_LEGACY_API_CALLERS_PER_ENDPOINT);
    expect(merged.at(-1)).toMatchObject({ isOther: true });
    expect(merged.reduce((sum, caller) => sum + caller.count, 0)).toBe(325);
  });

  it("can retain raw hour-bucket callers until the final rollup", () => {
    const callers = Array.from({ length: 25 }, (_, index) => ({
      userAgent: `caller-${index}`,
      count: 1,
      lastSeen: "2026-07-23T10:00:00Z",
    }));

    expect(mergeV4LegacyApiCallers(callers, { maxCallers: null })).toHaveLength(
      25,
    );
  });

  it("keeps one overflow bucket when a capped rollup is merged again", () => {
    const callers = [
      ...Array.from({ length: 20 }, (_, index) => ({
        userAgent: `caller-${index}`,
        count: 1,
        lastSeen: "2026-07-23T10:00:00Z",
      })),
      {
        isOther: true as const,
        count: 4,
        lastSeen: "2026-07-23T11:00:00Z",
      },
    ];

    const merged = mergeV4LegacyApiCallers(callers);

    expect(merged).toHaveLength(20);
    expect(merged.filter((caller) => caller.isOther)).toEqual([
      {
        isOther: true,
        count: 5,
        lastSeen: "2026-07-23T11:00:00Z",
      },
    ]);
  });
});

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
    const twoDaysAgo = nowMs - 2 * 24 * HOUR_MS;
    const hourStartMs = Math.floor(twoDaysAgo / HOUR_MS) * HOUR_MS;
    const ttl = v4LegacyApiHourBucketTtlSeconds(hourStartMs, nowMs);
    // ~2 days remaining of the 4d horizon
    expect(ttl).toBeGreaterThan(1 * 24 * 60 * 60);
    expect(ttl).toBeLessThan(3 * 24 * 60 * 60);
  });

  it("clamps to at least 1 second when the hour is already past the horizon", () => {
    const hourStartMs = nowMs - 20 * 24 * HOUR_MS;
    expect(v4LegacyApiHourBucketTtlSeconds(hourStartMs, nowMs)).toBe(1);
  });
});

describe("aggregateV4LegacyApiHourBuckets", () => {
  it("applies the caller cap only after all hour buckets are merged", () => {
    const rollup = aggregateV4LegacyApiHourBuckets(
      Array.from({ length: 3 }, (_, hour) => ({
        version: 1 as const,
        computedAt: `2026-06-24T0${hour}:30:00.000Z`,
        apiRows: [
          {
            projectId: "project-1",
            entrypoint: "publicapi: GET /api/public/traces",
            count: 209,
            lastSeen: `2026-06-24T0${hour}:15:00.000Z`,
            callers: [
              ...Array.from({ length: 20 }, (_, index) => ({
                userAgent: `hour-${hour}-caller-${index}`,
                count: 10,
                lastSeen: `2026-06-24T0${hour}:10:00.000Z`,
              })),
              {
                userAgent: "steady-caller",
                count: 9,
                lastSeen: `2026-06-24T0${hour}:15:00.000Z`,
              },
            ],
          },
        ],
        experimentPostRows: [],
      })),
    );

    const callers = rollup.apiRowsByProjectId.get("project-1")?.[0]?.callers;
    expect(callers).toHaveLength(MAX_V4_LEGACY_API_CALLERS_PER_ENDPOINT);
    expect(callers).toContainEqual(
      expect.objectContaining({ userAgent: "steady-caller", count: 27 }),
    );
    expect(callers?.filter((caller) => caller.isOther)).toHaveLength(1);
    expect(callers?.reduce((sum, caller) => sum + caller.count, 0)).toBe(627);
  });

  it("keeps one endpoint total while preserving attributed and historical callers", () => {
    const rollup = aggregateV4LegacyApiHourBuckets([
      {
        version: 1,
        computedAt: "2026-06-24T00:00:00.000Z",
        apiRows: [
          {
            projectId: "project-1",
            entrypoint: "publicapi: GET /api/public/traces",
            count: 2,
            lastSeen: "2026-06-24T10:00:00.000Z",
          },
        ],
        experimentPostRows: [],
      },
      {
        version: 1,
        computedAt: "2026-06-25T00:00:00.000Z",
        apiRows: [
          {
            projectId: "project-1",
            entrypoint: "publicapi: GET /api/public/traces",
            count: 3,
            lastSeen: "2026-06-25T10:00:00.000Z",
            callers: [
              {
                sdkName: "python",
                sdkVersion: "4.8.1",
                userAgent: "langfuse-python/4.8.1",
                count: 2,
                lastSeen: "2026-06-25T10:00:00.000Z",
              },
              {
                userAgent: "Codex CLI/1.2.3",
                count: 1,
                lastSeen: "2026-06-25T09:00:00.000Z",
              },
            ],
          },
        ],
        experimentPostRows: [],
      },
    ]);

    expect(rollup.apiRowsByProjectId.get("project-1")).toEqual([
      expect.objectContaining({
        entrypoint: "publicapi: GET /api/public/traces",
        count: 5,
        lastSeen: "2026-06-25T10:00:00.000Z",
        callers: expect.arrayContaining([
          {
            sdkName: "python",
            sdkVersion: "4.8.1",
            userAgent: "langfuse-python/4.8.1",
            count: 2,
            lastSeen: "2026-06-25T10:00:00.000Z",
          },
          {
            userAgent: "Codex CLI/1.2.3",
            count: 1,
            lastSeen: "2026-06-25T09:00:00.000Z",
          },
          {
            count: 2,
            lastSeen: "2026-06-24T10:00:00.000Z",
          },
        ]),
      }),
    ]);
  });
});
