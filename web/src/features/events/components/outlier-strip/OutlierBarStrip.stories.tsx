import { fn } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { OutlierBarStrip } from "./OutlierBarStrip";
import { makeFixtureSeries } from "./lib/fixtures";

/**
 * Design surface for the outlier strip above the trace table (LFE-14451).
 * Every bar is the WORST single event in its time bucket (max cost / latency
 * / tokens) — the strip exists to click into spikes, so the visual must read
 * at a glance: compact, Firefox-devtools-inspired, values on hover only,
 * sparse gridline ticks, a baseline that keeps the plot boundary visible
 * where data is absent.
 *
 * Locked defaults (design review 2026-07-27): sqrt scale, 40px height.
 */

const spikyCost = makeFixtureSeries({
  rangeMs: 24 * 3600 * 1000,
  stepSeconds: 600,
  profile: "spiky",
  metric: "cost",
});

const meta = preview.meta({
  component: OutlierBarStrip,
  args: {
    onSelectBucket: fn(),
  },
});

export const Default = meta.story({
  args: {
    ...spikyCost,
    metric: "cost",
    widthPx: 720,
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
          <OutlierBarStrip
            {...spikyCost}
            metric="cost"
            widthPx={720}
            scale={scale}
          />
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
          <OutlierBarStrip
            {...spikyCost}
            metric="cost"
            widthPx={720}
            heightPx={height}
          />
        </div>
      ))}
    </div>
  ),
});

/** The ≥1200px layout: three 400px charts side by side. */
export const ThreeUp = meta.story({
  render: () => {
    const cost = makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 1800,
      profile: "spiky",
      metric: "cost",
    });
    const latency = makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 1800,
      profile: "spiky",
      metric: "latency",
    });
    const tokens = makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 1800,
      profile: "spiky",
      metric: "tokens",
    });
    return (
      <div className="flex gap-6 p-2">
        <OutlierBarStrip {...cost} metric="cost" widthPx={400} />
        <OutlierBarStrip {...latency} metric="latency" widthPx={400} />
        <OutlierBarStrip {...tokens} metric="tokens" widthPx={400} />
      </div>
    );
  },
});

export const BurstyWeek = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 7 * 24 * 3600 * 1000,
      stepSeconds: 3600,
      profile: "bursty",
      metric: "latency",
    }),
    metric: "latency",
    widthPx: 900,
  },
});

export const SparseData = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 600,
      profile: "sparse",
      metric: "tokens",
    }),
    metric: "tokens",
    widthPx: 720,
  },
});

/** Events exist but carry no cost data (e.g. root-only shapes) — the strip
 * shows activity ticks + an honest hint instead of a fake-zero skyline. */
export const NoMetricData = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 600,
      profile: "noMetricData",
      metric: "cost",
    }),
    metric: "cost",
    widthPx: 720,
  },
});

export const MinimalNoLabels = meta.story({
  args: {
    ...spikyCost,
    metric: "cost",
    widthPx: 720,
    showTimeLabels: false,
  },
});
