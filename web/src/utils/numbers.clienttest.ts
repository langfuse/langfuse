// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  centCostFormatter,
  costFormatter,
  latencyFormatter,
} from "@/src/utils/numbers";

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

describe("latencyFormatter", () => {
  it("scales milliseconds into narrow duration units", () => {
    expect(latencyFormatter(0)).toBe("0ms");
    expect(latencyFormatter(450)).toBe("450ms");
    expect(latencyFormatter(1_000)).toBe("1s");
    expect(latencyFormatter(7_300)).toBe("7.3s");
    expect(latencyFormatter(60_000)).toBe("1m");
    expect(latencyFormatter(125_000)).toBe("2.08m");
    expect(latencyFormatter(3_600_000)).toBe("1h");
    expect(latencyFormatter(86_400_000)).toBe("1d");
    expect(latencyFormatter(undefined)).toBe("0ms");
  });
});

describe("latencyFormatter when unit style is unsupported", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls back to suffix formatting instead of failing module evaluation", async () => {
    const OriginalNumberFormat = Intl.NumberFormat;
    const NumberFormatWithoutUnit = function (
      locales?: string | string[],
      options?: Intl.NumberFormatOptions,
    ) {
      if (options?.style === "unit") {
        throw new RangeError(
          "Value unit out of range for Intl.NumberFormat options property style",
        );
      }
      return new OriginalNumberFormat(locales, options);
    } as typeof Intl.NumberFormat;
    NumberFormatWithoutUnit.supportedLocalesOf =
      OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);

    vi.stubGlobal("Intl", {
      ...Intl,
      NumberFormat: NumberFormatWithoutUnit,
    });
    vi.resetModules();

    const { latencyFormatter: formatLatency } =
      await import("@/src/utils/numbers");

    expect(formatLatency(450)).toBe("450ms");
    expect(formatLatency(7_300)).toBe("7.3s");
    expect(formatLatency(60_000)).toBe("1m");
    expect(() => formatLatency(0)).not.toThrow();
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
