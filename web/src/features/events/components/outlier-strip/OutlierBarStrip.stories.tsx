import { fn } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { OutlierBarStrip } from "./OutlierBarStrip";
import { makeFixtureSeries } from "./lib/fixtures";

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
          <div className="text-tertiary mb-1 font-mono text-[10px]">
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
          <div className="text-tertiary mb-1 font-mono text-[10px]">
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

export const MinimalNoLabels = meta.story({
  args: {
    ...spikyCost,
    metric: "cost",
    showTimeLabels: false,
  },
});
