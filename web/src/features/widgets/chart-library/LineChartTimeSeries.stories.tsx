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
  days = 14,
): DataPoint[] => {
  const points: DataPoint[] = [];
  for (let day = 0; day < days; day++) {
    const label = `6/${day + 1}`;
    series.forEach(({ name, base, amp }, seed) => {
      const wave = 0.5 + 0.5 * Math.sin((day + seed * 1.7) / 2.3);
      const jitter = ((seed * 37 + day * 13) % 17) / 17;
      points.push({
        time_dimension: label,
        dimension: name,
        metric: Math.round(base + amp * wave + amp * 0.25 * jitter),
      });
    });
  }
  return points;
};

// Non-additive latencies (ms) — summing these is nonsense; avg/median/last read well.
const latencyData = buildSeries([
  { name: "gpt-4o", base: 800, amp: 600 },
  { name: "claude-3-5-sonnet", base: 1200, amp: 900 },
  { name: "gpt-4o-mini", base: 300, amp: 250 },
  { name: "<synthetic>", base: 1500, amp: 1100 },
]);

// Additive token counts — "sum" reconciles with a headline total.
const tokenData = buildSeries([
  { name: "gpt-4o", base: 40_000, amp: 30_000 },
  { name: "claude-3-5-sonnet", base: 25_000, amp: 18_000 },
  { name: "gpt-4o-mini", base: 90_000, amp: 60_000 },
]);

// Overloaded: many models at once (the Model-latencies failure case).
const manySeriesData = buildSeries(
  Array.from({ length: 12 }, (_, i) => ({
    name: `model-${String.fromCharCode(97 + i)}`,
    base: 200 + i * 90,
    amp: 150 + i * 60,
  })),
);

const msFormatter: MetricFormatterFunction = (value, options) =>
  formatMetric(value, { ...options, unit: "millisecond" });

const meta = preview.meta({
  component: LineChartTimeSeriesDemo,
  args: {
    data: latencyData,
    legendPosition: "below",
    metricFormatter: msFormatter,
  },
  // Host in a card-sized box so ResponsiveContainer has room (the widget shape).
  decorators: [
    (Story) => (
      <div className="bg-background h-[320px] w-[640px] rounded-md border p-3">
        <Story />
      </div>
    ),
  ],
});

// ── Legend summary ───────────────────────────────────────────────────────────
// Additive metrics (token counts) carry a `sum` value in the legend; non-additive
// metrics (latency, scores) show the bare series name — a sum is meaningless and
// an unlabeled non-sum number reads ambiguously. (LFE-10549)

export const LegendNoneOnLatency = meta.story({
  args: { data: latencyData, legendSummary: "none" },
});

export const LegendSumOnAdditive = meta.story({
  args: { data: tokenData, legendSummary: "sum", metricFormatter: undefined },
});

// ── Overload handling (decide the de-clutter approach here) ───────────────────
// All three use the same 12-series overloaded dataset.

export const OverloadAllSeriesHighlight = meta.story({
  args: {
    data: manySeriesData,
    legendSummary: "none",
    legendInteraction: "highlight",
  },
});

export const OverloadToggleVisibility = meta.story({
  args: {
    data: manySeriesData,
    legendSummary: "none",
    legendInteraction: "toggle",
  },
});

export const OverloadTopFive = meta.story({
  args: {
    data: manySeriesData,
    legendSummary: "none",
    legendInteraction: "toggle",
    maxVisibleSeries: 5,
  },
});
