import { describe, it, expect } from "vitest";
import { MAX_EVENTS_METRICS_TIME_SERIES_BINS } from "@langfuse/shared";
import {
  pickStepSeconds,
  prepareOutlierSeries,
  type OutlierStripBin,
} from "./binning";

describe("pickStepSeconds", () => {
  it("picks the finest step that fits the width", () => {
    // 24h into 200 slots (1000px / 5px): 10m (144 bars) fits, 5m (288) not.
    expect(
      pickStepSeconds({
        rangeMs: 24 * 3600 * 1000,
        widthPx: 1000,
        barSlotPx: 5,
      }),
    ).toBe(600);
  });

  it("adapts to narrower widths with coarser steps", () => {
    // 24h into 60 slots: 30m (48 bars) fits, 15m (96) not.
    expect(
      pickStepSeconds({
        rangeMs: 24 * 3600 * 1000,
        widthPx: 300,
        barSlotPx: 5,
      }),
    ).toBe(1800);
  });

  it("falls back to day-multiples beyond the ladder", () => {
    // 2 years into 100 slots: needs ~7.3d per bar → 8d step.
    const step = pickStepSeconds({
      rangeMs: 730 * 86400 * 1000,
      widthPx: 500,
      barSlotPx: 5,
    });
    expect(step % 86400).toBe(0);
    expect((730 * 86400) / step).toBeLessThanOrEqual(100);
  });

  it("never exceeds the server bin cap even on huge widths", () => {
    const step = pickStepSeconds({
      rangeMs: 90 * 86400 * 1000,
      widthPx: 100_000,
      barSlotPx: 1,
    });
    expect((90 * 86400) / step).toBeLessThanOrEqual(
      MAX_EVENTS_METRICS_TIME_SERIES_BINS,
    );
  });
});

describe("prepareOutlierSeries", () => {
  const bin = (
    bucketStartMs: number,
    value: number | null,
  ): OutlierStripBin => ({
    bucketStart: new Date(bucketStartMs),
    count: value === null ? 0 : 1,
    maxTotalCost: value,
    maxLatencySeconds: value,
    maxTotalTokens: value,
  });

  it("densifies onto the epoch grid with nulls for empty buckets", () => {
    const step = 60;
    const t0 = Math.floor(Date.UTC(2025, 2, 10, 10, 0, 0) / 60000) * 60000;
    const { dense, maxValue } = prepareOutlierSeries({
      bins: [bin(t0, 3), bin(t0 + 120_000, 7)],
      metric: "cost",
      fromMs: t0,
      toMs: t0 + 179_000, // covers three buckets
      stepSeconds: step,
    });

    expect(dense.map((d) => d.value)).toEqual([3, null, 7]);
    expect(maxValue).toBe(7);
  });

  it("aligns the grid to the epoch, not to `from`", () => {
    const step = 60;
    const t0 = Math.floor(Date.UTC(2025, 2, 10, 10, 0, 0) / 60000) * 60000;
    const { dense } = prepareOutlierSeries({
      bins: [bin(t0, 5)],
      metric: "cost",
      fromMs: t0 + 30_000, // mid-bucket start
      toMs: t0 + 90_000,
      stepSeconds: step,
    });

    // First grid bucket is the epoch-aligned one containing `from`.
    expect(dense[0].bucketStartMs).toBe(t0);
    expect(dense[0].value).toBe(5);
  });
});
