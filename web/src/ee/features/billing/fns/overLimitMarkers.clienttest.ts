import { describe, expect, it } from "vitest";

import { overLimitMarkers } from "./overLimitMarkers";

describe("overLimitMarkers", () => {
  it("marks the Hobby limits the organization is over", () => {
    expect(
      overLimitMarkers("cloud:hobby", {
        memberCount: 6,
        unitsThisPeriod: 180_000,
      }),
    ).toEqual({ users: "You have 6", units: "You sent 180,000" });
  });

  it("marks nothing at or under the limit, or without a count", () => {
    expect(
      overLimitMarkers("cloud:hobby", {
        memberCount: 2,
        unitsThisPeriod: 50_000,
      }),
    ).toEqual({});
    expect(overLimitMarkers("cloud:hobby", {})).toEqual({});
  });

  it("does not treat a paid plan's included units as a cap", () => {
    expect(
      overLimitMarkers("cloud:core", {
        memberCount: 40,
        unitsThisPeriod: 900_000,
      }),
    ).toEqual({});
  });
});
