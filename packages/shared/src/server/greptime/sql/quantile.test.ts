import { describe, expect, it } from "vitest";

import { greptimeQuantile, PERCENTILE_P } from "./quantile";

describe("greptimeQuantile", () => {
  it("wraps the value expression in uddsketch_calc(uddsketch_state(...))", () => {
    expect(greptimeQuantile(0.99, "latency")).toBe(
      "uddsketch_calc(0.99, uddsketch_state(128, 0.01, latency))",
    );
  });

  it("supports the named dashboard percentiles", () => {
    expect(greptimeQuantile(PERCENTILE_P.p50, "x")).toContain(
      "uddsketch_calc(0.5,",
    );
    expect(greptimeQuantile(PERCENTILE_P.p95, "x")).toContain(
      "uddsketch_calc(0.95,",
    );
  });

  it("rejects out-of-range p", () => {
    expect(() => greptimeQuantile(1.5, "x")).toThrow();
    expect(() => greptimeQuantile(-0.1, "x")).toThrow();
  });
});
