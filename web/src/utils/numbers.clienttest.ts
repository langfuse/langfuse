// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  centCostFormatter,
  costFormatter,
  latencyFormatter,
} from "@/src/utils/numbers";

describe("latencyFormatter", () => {
  it.each([
    [59_995, "1m"],
    [59_999, "1m"],
    [3_599_999, "1h"],
    [86_399_999, "1d"],
    [999.996, "1s"],
  ])("promotes %sms when rounding reaches the next unit", (value, expected) => {
    expect(latencyFormatter(value)).toBe(expected);
  });
});

describe("costFormatter", () => {
  it("formats dashboard costs with cent precision", () => {
    expect(costFormatter(4.402973)).toBe("$4.40");
    expect(costFormatter(0.068415)).toBe("$0.07");
    expect(costFormatter(0.015427)).toBe("$0.02");
    expect(costFormatter(0)).toBe("$0.00");
  });

  it("keeps sub-cent costs visible instead of rounding them to $0.00", () => {
    expect(costFormatter(0.000601)).toBe("$0.000601");
  });

  it("uses cent precision from one cent up", () => {
    expect(costFormatter(0.01)).toBe("$0.01");
    // Three significant digits can still round up to a full cent.
    expect(costFormatter(0.009999)).toBe("$0.01");
  });

  it("stops widening at ten fraction digits", () => {
    expect(costFormatter(0.0000000001)).toBe("$0.0000000001");
    expect(costFormatter(0.00000000001)).toBe("$0.00");
  });

  it("formats missing and negative costs", () => {
    expect(costFormatter(undefined)).toBe("$0.00");
    expect(costFormatter(-0.000601)).toBe("-$0.000601");
    expect(costFormatter(-4.402973)).toBe("-$4.40");
  });
});

describe("centCostFormatter", () => {
  it("rounds to cents and flags sub-cent costs instead of showing $0.00", () => {
    expect(centCostFormatter(0.36674048)).toBe("$0.37");
    expect(centCostFormatter(0.005)).toBe("$0.01");
    expect(centCostFormatter(0.0049)).toBe("<$0.01");
    expect(centCostFormatter(0)).toBe("$0.00");
  });

  it("keeps the sign on negative costs", () => {
    expect(centCostFormatter(-0.37)).toBe("-$0.37");
    expect(centCostFormatter(-0.0049)).toBe("-<$0.01");
  });
});
