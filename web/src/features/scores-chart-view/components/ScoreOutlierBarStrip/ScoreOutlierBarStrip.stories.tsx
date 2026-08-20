import { fn } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { ScoreOutlierBarStrip } from "@/src/features/scores-chart-view/components/ScoreOutlierBarStrip/ScoreOutlierBarStrip";
import { prepareScoreOutlierSeries } from "@/src/features/scores-chart-view/fns/binning/scoreOutlierBinning";
import { type ScoreOutlierBin } from "@/src/features/scores-chart-view/types";

/**
 * Design surface for the outlier strip above the scores table — the scores
 * analogue of the observations strip's `OutlierBarStrip.stories.tsx`. Each
 * bar aggregates its time bucket (score count, or avg/min/max value); the
 * strip exists to click into spikes, so the visual must read at a glance.
 */

// mulberry32 — tiny, deterministic PRNG so every Storybook render is identical.
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const BASE_MS = Date.UTC(2026, 6, 26, 0, 0, 0);

function makeFixtureBins(params: {
  rangeMs: number;
  stepSeconds: number;
  sparse?: boolean;
  noMetricData?: boolean;
  seed?: number;
}): { bins: ScoreOutlierBin[]; fromMs: number; toMs: number } {
  const rand = mulberry32(params.seed ?? 42);
  const stepMs = params.stepSeconds * 1000;
  const fromMs = BASE_MS;
  const toMs = fromMs + params.rangeMs;

  const bins: ScoreOutlierBin[] = [];
  for (let t = fromMs; t < toMs; t += stepMs) {
    if (params.sparse && rand() < 0.7) continue;
    const count = Math.max(1, Math.round(rand() * 20));
    const avg = 0.5 + rand() * 0.4;
    bins.push({
      bucketStart: new Date(t),
      count,
      values: {
        count_count: count,
        avg_value: params.noMetricData ? null : avg,
        min_value: params.noMetricData ? null : Math.max(0, avg - 0.3),
        max_value: params.noMetricData ? null : Math.min(1, avg + 0.3),
      },
    });
  }
  return { bins, fromMs, toMs };
}

function makeFixtureSeries(params: {
  rangeMs: number;
  stepSeconds: number;
  metric: "count" | "value";
  widthPx: number;
  sparse?: boolean;
  noMetricData?: boolean;
}) {
  const { bins, fromMs, toMs } = makeFixtureBins(params);
  return {
    ...prepareScoreOutlierSeries({
      bins,
      metric: params.metric,
      fromMs,
      toMs,
      stepSeconds: params.stepSeconds,
      widthPx: params.widthPx,
    }),
    stepMs: params.stepSeconds * 1000,
    widthPx: params.widthPx,
  };
}

const dayOfCounts = makeFixtureSeries({
  rangeMs: 24 * 3600 * 1000,
  stepSeconds: 600,
  metric: "count",
  widthPx: 720,
});

const meta = preview.meta({
  component: ScoreOutlierBarStrip,
  args: {
    onSelectBucket: fn(),
  },
});

export const Default = meta.story({
  args: { ...dayOfCounts, metric: "count" },
});

export const Disabled = meta.story({
  args: {
    ...dayOfCounts,
    metric: "count",
    disabledReason: "Chart unavailable for the current filters",
  },
});

export const AverageValue = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 600,
      metric: "value",
      widthPx: 720,
    }),
    metric: "value",
  },
});

export const SparseData = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 600,
      metric: "count",
      widthPx: 720,
      sparse: true,
    }),
    metric: "count",
  },
});

/** Scores exist but carry no numeric value (all-CATEGORICAL bucket) — the
 * strip shows activity ticks + an honest hint instead of a fake-zero skyline. */
export const NoMetricData = meta.story({
  args: {
    ...makeFixtureSeries({
      rangeMs: 24 * 3600 * 1000,
      stepSeconds: 600,
      metric: "value",
      widthPx: 720,
      noMetricData: true,
    }),
    metric: "value",
  },
});

export const EmptyRange = meta.story({
  args: {
    ...dayOfCounts,
    dense: dayOfCounts.dense.map((bin) => ({ ...bin, value: null, count: 0 })),
    maxValue: 0,
    metric: "count",
  },
});
