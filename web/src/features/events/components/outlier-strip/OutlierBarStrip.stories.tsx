import { expect, fn, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { OutlierBarStrip } from "./OutlierBarStrip";
import { makeFixtureSeries } from "./lib/fixtures";
import { prepareOutlierSeries, type OutlierStripBin } from "./lib/binning";

/**
 * Design surface for the outlier strip above the trace table (LFE-14451).
 * Each bar aggregates its time bucket (observation count, summed cost, or
 * p95/avg latency) — the strip exists to click into spikes, so the visual must read
 * at a glance: compact, Firefox-devtools-inspired, exact values on hover,
 * horizontal value gridlines with left sans labels (no vertical lines), a
 * baseline that keeps the plot boundary visible where data is absent.
 *
 * Locked defaults (design review 2026-07-27): sqrt scale, 40px height.
 */

const spikyCost = makeFixtureSeries({
  rangeMs: 24 * 3600 * 1000,
  stepSeconds: 600,
  profile: "spiky",
  metric: "cost",
  widthPx: 720,
});

const spikyCount = makeFixtureSeries({
  rangeMs: 24 * 3600 * 1000,
  stepSeconds: 600,
  profile: "spiky",
  metric: "count",
  widthPx: 720,
});

const meta = preview.meta({
  component: OutlierBarStrip,
  args: {
    onSelectBucket: fn(),
  },
});

export const Default = meta.story({
  args: {
    ...spikyCount,
    metric: "count",
  },
});

export const Disabled = meta.story({
  args: {
    ...spikyCount,
    metric: "count",
    disabledReason: "Chart unavailable for the current filters",
  },
});

/** Real outliers are 10–40x the base load: linear scale crushes the base into
 * a barely-visible baseline; sqrt (the locked default) keeps the base
 * readable while spikes still dominate. */
export const ScaleMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-5 p-2">
      {(["linear", "sqrt"] as const).map((scale) => (
        <div key={scale}>
          <div className="text-muted-foreground mb-1 font-mono text-[10px]">
            scale: {scale}
          </div>
          <OutlierBarStrip {...spikyCost} metric="cost" scale={scale} />
        </div>
      ))}
    </div>
  ),
});

export const HeightMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-5 p-2">
      {[40, 56, 72].map((height) => (
        <div key={height}>
          <div className="text-muted-foreground mb-1 font-mono text-[10px]">
            height {height}px
          </div>
          <OutlierBarStrip {...spikyCost} metric="cost" heightPx={height} />
        </div>
      ))}
    </div>
  ),
});

export const BurstyWeek = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 7 * 24 * 3600 * 1000,
      stepSeconds: 3600,
      profile: "bursty",
      metric: "latency",
      widthPx: 900,
    }),
    metric: "latency",
  },
});

export const SparseData = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 600,
      profile: "sparse",
      metric: "latency",
      widthPx: 720,
    }),
    metric: "latency",
  },
});

/** Observations exist but carry no cost data (e.g. root-only shapes) — the strip
 * shows activity ticks + an honest hint instead of a fake-zero skyline. */
export const NoMetricData = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 600,
      profile: "noMetricData",
      metric: "cost",
      widthPx: 720,
    }),
    metric: "cost",
  },
});

/** Nothing in the window at all. The notice centers on the bar canvas, so it
 * sits in the plot's middle rather than drifting into the time-label band
 * (LFE-14829). */
export const EmptyRange = meta.story({
  args: {
    ...spikyCount,
    dense: spikyCount.dense.map((bin) => ({ ...bin, value: null, count: 0 })),
    maxValue: 0,
    metric: "count",
  },
});

export const MinimalNoLabels = meta.story({
  args: {
    ...spikyCost,
    metric: "cost",
    showTimeLabels: false,
  },
});

/** Last bucket is also a tick: a start-anchored date would clip off the svg. */
function lastBinTickSeries(widthPx: number) {
  const stepSeconds = 86400;
  const t0 = 0;
  const n = 45;
  const bins: OutlierStripBin[] = Array.from({ length: n }, (_, i) => ({
    bucketStart: new Date(t0 + i * stepSeconds * 1000),
    count: 4 + (i % 7),
    values: {
      count_count: 4 + (i % 7),
      sum_totalCost: 0.02 * (1 + (i % 5)),
      p95_latency: 400 + (i % 9) * 80,
      p50_latency: 200 + (i % 9) * 40,
    },
  }));
  return {
    ...prepareOutlierSeries({
      bins,
      metric: "latency",
      fromMs: t0,
      toMs: t0 + n * stepSeconds * 1000,
      stepSeconds,
      widthPx,
    }),
    stepMs: stepSeconds * 1000,
    widthPx,
  };
}

export const LastDateAtEdge = meta.story({
  args: {
    ...lastBinTickSeries(450),
    metric: "latency",
  },
});

export const TestLastDateFullyVisible = meta.story({
  name: "(Test) Last Date Fully Visible",
  args: {
    ...lastBinTickSeries(450),
    metric: "latency",
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const svg = canvasElement.querySelector("svg");
      expect(svg).toBeTruthy();
    });
    const svg = canvasElement.querySelector("svg");
    if (!svg) throw new Error("plot svg not found");
    const svgBox = svg.getBoundingClientRect();
    const timeLabels = [...svg.querySelectorAll("text")].filter((el) =>
      /^[A-Z][a-z]{2} \d/.test(el.textContent ?? ""),
    );
    await expect(timeLabels.length).toBeGreaterThan(0);
    for (const label of timeLabels) {
      const box = label.getBoundingClientRect();
      await expect(box.right).toBeLessThanOrEqual(svgBox.right + 1);
      await expect(box.left).toBeGreaterThanOrEqual(svgBox.left - 1);
    }
  },
});
