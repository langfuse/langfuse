// @vitest-environment node

import { describe, expect, it } from "vitest";

import { costFormatter } from "@/src/utils/numbers";

describe("costFormatter", () => {
  it("formats dashboard costs with cent precision", () => {
    expect(costFormatter(4.402973)).toBe("$4.40");
    expect(costFormatter(0.068415)).toBe("$0.07");
    expect(costFormatter(0.015427)).toBe("$0.02");
    expect(costFormatter(0)).toBe("$0.00");
  });

  it("keeps sub-cent costs visible instead of rounding them to $0.00", () => {
    expect(costFormatter(0.000601)).toBe("$0.000601");
    expect(costFormatter(0.004)).toBe("$0.004");
    expect(costFormatter(0.0000123)).toBe("$0.0000123");
    expect(costFormatter(0.00999)).toBe("$0.00999");
    expect(costFormatter(0.0000001)).toBe("$0.0000001");
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
