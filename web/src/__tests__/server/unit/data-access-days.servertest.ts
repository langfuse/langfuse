import { describe, expect, it } from "vitest";

import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";

const NOW = new Date("2026-08-28T12:00:00.000Z");

describe("clampToDataAccessDays", () => {
  it.each([
    ["cloud:hobby", "2026-07-29T12:00:00.000Z"],
    ["cloud:core", "2026-05-30T12:00:00.000Z"],
  ] as const)(
    "injects the data access floor for %s",
    (plan, expectedTimestamp) => {
      expect(
        clampToDataAccessDays({
          plan,
          fromTimestamp: undefined,
          now: NOW,
        }),
      ).toEqual({
        accessFloor: new Date(expectedTimestamp),
        effectiveFromTimestamp: new Date(expectedTimestamp),
        wasClamped: true,
      });
    },
  );

  it("clamps a timestamp older than the Hobby floor", () => {
    expect(
      clampToDataAccessDays({
        plan: "cloud:hobby",
        fromTimestamp: "2026-01-01T00:00:00.000Z",
        now: NOW,
      }).effectiveFromTimestamp,
    ).toEqual(new Date("2026-07-29T12:00:00.000Z"));
  });

  it.each([
    ["cloud:hobby", "2026-08-21T12:00:00.000Z"],
    ["cloud:core", "2026-06-28T12:00:00.000Z"],
  ] as const)(
    "preserves a requested timestamp inside the %s window",
    (plan, requested) => {
      expect(
        clampToDataAccessDays({ plan, fromTimestamp: requested, now: NOW }),
      ).toMatchObject({
        effectiveFromTimestamp: new Date(requested),
        wasClamped: false,
      });
    },
  );

  it("preserves a timestamp exactly on the boundary", () => {
    const boundary = new Date("2026-07-29T12:00:00.000Z");

    expect(
      clampToDataAccessDays({
        plan: "cloud:hobby",
        fromTimestamp: boundary,
        now: NOW,
      }),
    ).toEqual({
      accessFloor: boundary,
      effectiveFromTimestamp: boundary,
      wasClamped: false,
    });
  });

  it.each([
    "cloud:pro",
    "cloud:team",
    "cloud:enterprise",
    "oss",
    "self-hosted:pro",
    "self-hosted:enterprise",
  ] as const)("leaves unlimited plan %s unchanged", (plan) => {
    expect(
      clampToDataAccessDays({
        plan,
        fromTimestamp: undefined,
        now: NOW,
      }),
    ).toEqual({
      accessFloor: undefined,
      effectiveFromTimestamp: undefined,
      wasClamped: false,
    });
  });

  it("uses the existing OSS fallback for a missing plan", () => {
    expect(
      clampToDataAccessDays({
        plan: null,
        fromTimestamp: "2026-01-01T00:00:00.000Z",
        now: NOW,
      }),
    ).toEqual({
      accessFloor: undefined,
      effectiveFromTimestamp: new Date("2026-01-01T00:00:00.000Z"),
      wasClamped: false,
    });
  });
});
