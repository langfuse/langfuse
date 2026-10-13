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
});
