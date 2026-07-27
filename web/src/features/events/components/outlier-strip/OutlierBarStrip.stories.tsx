import { fn } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { OutlierBarStrip } from "./OutlierBarStrip";
import { makeFixtureSeries } from "./lib/fixtures";

/**
 * Design decision surface for the outlier strip above the trace table
 * (LFE-14451). Every bar is the WORST single event in its time bucket (max
 * cost / latency / tokens) — the strip exists to click/drag into spikes, so
 * the visual must read at a glance: compact, Firefox-devtools-inspired,
 * minimal text, values on hover only.
 *
 * Open visual picks (the knobs on these stories):
 *  • bar slot width: 3px (densest) / 5px / 8px
 *  • scan bands: alternating time bands vs value gridbands vs none
 *  • labels: sparse time labels + tiny max label — keep or drop
 *  • strip height: 40 / 56 / 72px
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
  },
});

export const VariantMatrix = meta.story({
  render: () => (
    <div className="flex flex-col gap-5 p-2">
      {([3, 5, 8] as const).map((slot) =>
        (["time", "value", "none"] as const).map((bands) => (
          <div key={`${slot}-${bands}`}>
            <div className="text-muted-foreground mb-1 font-mono text-[10px]">
              slot {slot}px · bands: {bands}
            </div>
            <OutlierBarStrip
              {...spikyCost}
              metric="cost"
              barSlotPx={slot}
              bands={bands}
            />
          </div>
        )),
      )}
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

export const TwoUp = meta.story({
  render: () => {
    const latency = makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 1200,
      profile: "spiky",
      metric: "latency",
    });
    const cost = makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 1200,
      profile: "spiky",
      metric: "cost",
    });
    return (
      <div className="flex gap-6 p-2">
        <div>
          <div className="text-muted-foreground mb-1 font-mono text-[10px]">
            Cost
          </div>
          <OutlierBarStrip {...cost} metric="cost" />
        </div>
        <div>
          <div className="text-muted-foreground mb-1 font-mono text-[10px]">
            Latency
          </div>
          <OutlierBarStrip {...latency} metric="latency" />
        </div>
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
  },
});

export const MinimalNoLabels = meta.story({
  args: {
    ...spikyCost,
    metric: "cost",
    showMaxLabel: false,
    showTimeLabels: false,
    bands: "none",
    heightPx: 40,
  },
});
