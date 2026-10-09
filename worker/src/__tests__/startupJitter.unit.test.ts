import { describe, expect, it } from "vitest";
import { getStartupJitterMs } from "../utils/startupJitter";

describe("getStartupJitterMs", () => {
  it("returns 0 when disabled", () => {
    expect(getStartupJitterMs(0, () => 0.9)).toBe(0);
  });

  it("scales the random value to [0, maxMs]", () => {
    expect(getStartupJitterMs(10_000, () => 0)).toBe(0);
    expect(getStartupJitterMs(10_000, () => 0.5)).toBe(5_000);
    expect(getStartupJitterMs(10_000, () => 0.999999999)).toBe(10_000);
  });

  it("stays within bounds for Math.random", () => {
    for (let i = 0; i < 1_000; i++) {
      const ms = getStartupJitterMs(30_000);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(30_000);
      expect(Number.isInteger(ms)).toBe(true);
    }
  });
});
