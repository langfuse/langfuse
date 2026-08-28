import {
  calculateAggregatedUsage,
  hasNonZeroUsageDetails,
} from "./calculateAggregatedUsage";

describe("hasNonZeroUsageDetails", () => {
  it("is false for empty or zeroed usage", () => {
    expect(hasNonZeroUsageDetails(undefined)).toBe(false);
    expect(hasNonZeroUsageDetails({})).toBe(false);
    expect(hasNonZeroUsageDetails({ input: 0, output: 0, total: 0 })).toBe(
      false,
    );
  });

  it("is true for custom-only usage keys", () => {
    expect(hasNonZeroUsageDetails({ cache_read: 50 })).toBe(true);
  });
});

describe("calculateAggregatedUsage", () => {
  it("does not treat custom-only keys as input, output, or total", () => {
    expect(calculateAggregatedUsage({ cache_read: 50 })).toEqual({
      input: 0,
      output: 0,
      total: 0,
    });
  });
});
