import preview from "../../../../.storybook/preview";
import { LineChartTimeSeries } from "./LineChartTimeSeries";
import { formatMetric } from "./utils";
import {
  type ChartProps,
  type DataPoint,
  type MetricFormatterFunction,
} from "./chart-props";

// Thin wrapper so args infer at ChartProps. LineChartTimeSeries is typed as
// React.FC<ChartProps>, whose ComponentProps don't flow cleanly through
// preview.meta (story args resolve to `never`); a plain (props: ChartProps)
// component pins them. (Same escape hatch as data-table.stories.tsx.)
const LineChartTimeSeriesDemo = (props: ChartProps) => (
  <LineChartTimeSeries {...props} />
);

/**
 * Deterministic fake-ish time series — no Math.random so stories are stable.
 * `base`/`amp` shape each series; values stay non-negative like real metrics.
 */
const buildSeries = (
  series: { name: string; base: number; amp: number }[],
  buckets: number,
  labelAt: (bucket: number) => string,
): DataPoint[] => {
  const points: DataPoint[] = [];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const label = labelAt(bucket);
    series.forEach(({ name, base, amp }, seed) => {
      const wave = 0.5 + 0.5 * Math.sin((bucket + seed * 1.7) / 2.3);
      const jitter = ((seed * 37 + bucket * 13) % 17) / 17;
      points.push({
        time_dimension: label,
        dimension: name,
        metric: Math.round(base + amp * wave + amp * 0.25 * jitter),
      });
    });
  }
  return points;
};

const categoryLabelAt = (bucket: number) => `6/${bucket + 1}`;
const isoDay = (day: number, hour: number) =>
  new Date(Date.UTC(2026, 5, 22 + day, hour)).toISOString();

// Non-additive latencies (ms) — summing these is nonsense; avg/median/last read well.
const latencyData = buildSeries(
  [
    { name: "gpt-4o", base: 800, amp: 600 },
    { name: "claude-3-5-sonnet", base: 1200, amp: 900 },
    { name: "gpt-4o-mini", base: 300, amp: 250 },
    { name: "<synthetic>", base: 1500, amp: 1100 },
  ],
  14,
  categoryLabelAt,
);

// Additive token counts — "sum" reconciles with a headline total.
const tokenData = buildSeries(
  [
    { name: "gpt-4o", base: 40_000, amp: 30_000 },
    { name: "claude-3-5-sonnet", base: 25_000, amp: 18_000 },
    { name: "gpt-4o-mini", base: 90_000, amp: 60_000 },
  ],
  14,
  categoryLabelAt,
);

// Overloaded: many models at once (the Model-latencies failure case).
const manySeriesData = buildSeries(
  Array.from({ length: 12 }, (_, i) => ({
    name: `model-${String.fromCharCode(97 + i)}`,
    base: 200 + i * 90,
    amp: 150 + i * 60,
  })),
  14,
  categoryLabelAt,
);

const temporalModels = [
  { name: "gpt-4o", base: 40_000, amp: 30_000 },
  { name: "claude-3-5-sonnet", base: 25_000, amp: 18_000 },
  { name: "gpt-4o-mini", base: 90_000, amp: 60_000 },
];
const dailyData = buildSeries(temporalModels, 14, (bucket) =>
  isoDay(bucket, 0),
);
const hourlyData = buildSeries(temporalModels, 24, (bucket) =>
  isoDay(0, bucket),
);
const singleSeriesData = dailyData.filter(
  (point) => point.dimension === "gpt-4o-mini",
);
const longNameData = buildSeries(
  [
    { name: "sa-investigation:sa-evidence-verifier", base: 4_000, amp: 2_500 },
    { name: "tool-bash-loghouse-querylog-reader", base: 28_000, amp: 9_000 },
    {
      name: "step-loghouse-cplogs-aggregation-pass",
      base: 2_600,
      amp: 1_400,
    },
    { name: "answer", base: 11_000, amp: 4_000 },
  ],
  14,
  (bucket) => isoDay(bucket, 0),
);

const syncedLabelAt = (bucket: number) => {
  const hour = 13 + Math.floor(bucket / 2);
  return `${hour}:${bucket % 2 === 0 ? "00" : "30"}`;
};
const syncedRequestsData = buildSeries(
  [
    { name: "web", base: 14_000, amp: 6_000 },
    { name: "worker", base: 9_000, amp: 4_000 },
  ],
  8,
  syncedLabelAt,
);
const syncedLatencyData = buildSeries(
  [
    { name: "post /api/chat-completion", base: 800, amp: 700 },
    { name: "get /api/traces", base: 300, amp: 200 },
  ],
  8,
  syncedLabelAt,
);

const msFormatter: MetricFormatterFunction = (value, options) =>
  formatMetric(value, { ...options, unit: "millisecond" });

const meta = preview.meta({
  component: LineChartTimeSeriesDemo,
  parameters: { layout: "fullscreen" },
});

// ── Legend summary ───────────────────────────────────────────────────────────
// Additive metrics (token counts) carry a `sum` value in the legend; non-additive
// metrics (latency, scores) show the bare series name — a sum is meaningless and
// an unlabeled non-sum number reads ambiguously. (LFE-10549)

export const LegendNoneOnLatency = meta.story({
  args: {
    data: latencyData,
    legendPosition: "below",
    legendSummary: "none",
    metricFormatter: msFormatter,
  },
});

export const LegendSumOnAdditive = meta.story({
  args: {
    data: tokenData,
    legendPosition: "below",
    legendSummary: "sum",
  },
});

// ── Overload handling (decide the de-clutter approach here) ───────────────────
// All three use the same 12-series overloaded dataset.

export const OverloadAllSeriesHighlight = meta.story({
  args: {
    data: manySeriesData,
    legendPosition: "below",
    legendSummary: "none",
    legendInteraction: "highlight",
    metricFormatter: msFormatter,
  },
});

export const OverloadToggleVisibility = meta.story({
  args: {
    data: manySeriesData,
    legendPosition: "below",
    legendSummary: "none",
    legendInteraction: "toggle",
    metricFormatter: msFormatter,
  },
});

export const OverloadTopFive = meta.story({
  args: {
    data: manySeriesData,
    legendPosition: "below",
    legendSummary: "none",
    legendInteraction: "toggle",
    maxVisibleSeries: 5,
    metricFormatter: msFormatter,
  },
});

export const DailyTimeScale = meta.story({
  args: {
    data: dailyData,
    legendPosition: "none",
  },
});

export const HourlyTimeScale = meta.story({
  args: {
    data: hourlyData,
    legendPosition: "none",
  },
});

export const SingleSeriesAutomaticLegend = meta.story({
  args: {
    data: singleSeriesData,
    legendPosition: "auto",
  },
});

export const MultipleSeriesAutomaticLegend = meta.story({
  args: {
    data: dailyData,
    legendPosition: "auto",
  },
});

export const WithLongSeriesNames = meta.story({
  args: {
    data: longNameData,
    legendPosition: "below",
  },
});

export const SyncedTimeline = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-[640px] flex-col gap-4 p-4">
      <p className="text-muted-foreground text-xs">
        Hover either chart to move the shared timeline across both.
      </p>
      <div className="bg-background h-[220px] rounded-md border p-3">
        <LineChartTimeSeries
          data={syncedRequestsData}
          syncId="synced-timeline"
          legendPosition="below"
          legendSummary="none"
          showDataPointDots={false}
        />
      </div>
      <div className="bg-background h-[220px] rounded-md border p-3">
        <LineChartTimeSeries
          data={syncedLatencyData}
          syncId="synced-timeline"
          legendPosition="below"
          legendSummary="none"
          showDataPointDots={false}
          metricFormatter={msFormatter}
        />
      </div>
    </div>
  ),
});
