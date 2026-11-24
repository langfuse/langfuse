import { describe, expect, it } from "vitest";
import { mapRefreshedProperties } from "./topicsAnalytics";

describe("mapRefreshedProperties", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");

  it("extracts metadata counts, rounded sample percent and minutes since last refit", () => {
    expect(
      mapRefreshedProperties(
        {
          filter: [
            {
              column: "name",
              type: "string",
              operator: "=",
              value: "secret-trace-name",
            },
          ],
          facetIds: ["intent", "outcome"],
          sampling: 0.255,
          lastRefitAt: "2026-10-09T10:30:00Z",
        },
        now,
      ),
    ).toEqual({
      filterCount: 1,
      facetCount: 2,
      samplePercent: 25.5,
      minutesSinceLastRefit: 90,
    });
  });

  it("returns null minutesSinceLastRefit before the first fit and clamps future timestamps to 0", () => {
    expect(
      mapRefreshedProperties(
        {
          filter: [],
          facetIds: ["intent"],
          sampling: 1,
          lastRefitAt: null,
        },
        now,
      ),
    ).toEqual({
      filterCount: 0,
      facetCount: 1,
      samplePercent: 100,
      minutesSinceLastRefit: null,
    });

    expect(
      mapRefreshedProperties(
        {
          filter: [],
          facetIds: ["intent"],
          sampling: 1,
          lastRefitAt: "2026-10-09T12:05:00Z",
        },
        now,
      ).minutesSinceLastRefit,
    ).toBe(0);
  });
});
