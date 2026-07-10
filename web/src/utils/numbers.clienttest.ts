import { getOutputTokensPerSecond } from "@/src/utils/numbers";

describe("getOutputTokensPerSecond", () => {
  it("divides output tokens by the generation window", () => {
    // latency 10s, TTFT 2s → generation window 8s
    expect(getOutputTokensPerSecond(80, 10, 2)).toBe(10);
  });

  it("returns undefined when time-to-first-token is missing", () => {
    expect(getOutputTokensPerSecond(80, 10, null)).toBeUndefined();
    expect(getOutputTokensPerSecond(80, 10, undefined)).toBeUndefined();
  });

  it("returns undefined when generation window is non-positive", () => {
    expect(getOutputTokensPerSecond(80, 2, 2)).toBeUndefined();
    expect(getOutputTokensPerSecond(80, 1, 2)).toBeUndefined();
  });

  it("returns undefined when output usage is zero", () => {
    expect(getOutputTokensPerSecond(0, 10, 2)).toBeUndefined();
  });
});
