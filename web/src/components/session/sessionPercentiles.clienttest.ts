import { describe, expect, it } from "vitest";
import { computeTurnLatencyPercentiles } from "./sessionPercentiles";

describe("computeTurnLatencyPercentiles", () => {
  it("ranks turns by latency with the midpoint formula", () => {
    // The handoff's 8-turn example: 1.93, 1.13, 2.48, 2.10, 2.00, 2.41,
    // 1.34, 2.62 → p31, p6, p81, p56, p44, p69, p19, p94.
    const result = computeTurnLatencyPercentiles([
      1.93, 1.13, 2.48, 2.1, 2.0, 2.41, 1.34, 2.62,
    ]);
    expect(result.map((entry) => entry?.label)).toEqual([
      "p31",
      "p6",
      "p81",
      "p56",
      "p44",
      "p69",
      "p19",
      "p94",
    ]);
  });

  it("flags only turns at or above the 90th percentile as slow", () => {
    const result = computeTurnLatencyPercentiles([
      1.93, 1.13, 2.48, 2.1, 2.0, 2.41, 1.34, 2.62,
    ]);
    expect(result.map((entry) => entry?.isSlow)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("returns null for turns without a latency datum", () => {
    const result = computeTurnLatencyPercentiles([1.5, null, undefined, 3.0]);
    expect(result[0]?.label).toBe("p25");
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
    expect(result[3]?.label).toBe("p75");
  });

  it("gives duplicate latencies the same (first) rank", () => {
    const result = computeTurnLatencyPercentiles([2, 2, 2, 2]);
    expect(new Set(result.map((entry) => entry?.label)).size).toBe(1);
    expect(result[0]?.isSlow).toBe(false);
  });

  it("labels a single turn p50", () => {
    expect(computeTurnLatencyPercentiles([1])[0]?.label).toBe("p50");
  });

  it("handles an empty session", () => {
    expect(computeTurnLatencyPercentiles([])).toEqual([]);
  });
});
