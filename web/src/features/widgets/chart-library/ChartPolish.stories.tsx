import preview from "../../../../.storybook/preview";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/src/components/ui/chart";
import { LineChartTimeSeries } from "./LineChartTimeSeries";
import { VerticalBarChartTimeSeries } from "./VerticalBarChartTimeSeries";
import { seriesColor } from "./TimeSeriesLegend";
import {
  formatMetric,
  groupDataByTimeDimension,
  toFullMetricString,
} from "./utils";
import {
  type DataPoint,
  type LegendPosition,
  type ChartProps,
} from "./chart-props";

/**
 * Decision surface for the LFE-10576 chart polish. Each story isolates one
 * taste call (vertical grid density, bar-chart grid, default legend
 * visibility) or one interactive fix (tooltip placement/sizing) on realistic
 * data, so the choice is made by looking at renders, not diffs. Deterministic
 * data only — no Math.random — so the renders are stable.
 */

// ── deterministic data ───────────────────────────────────────────────────────

/** ISO timestamps so prepareTimeAxis picks the temporal (not category) axis. */
const isoDay = (day: number, hour = 0) =>
  new Date(Date.UTC(2026, 5, 22 + day, hour)).toISOString();

const buildSeries = (
  series: { name: string; base: number; amp: number }[],
  buckets: number,
  timeAt: (i: number) => string,
): DataPoint[] => {
  const points: DataPoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const time = timeAt(i);
    series.forEach(({ name, base, amp }, seed) => {
      const wave = 0.5 + 0.5 * Math.sin((i + seed * 1.7) / 2.3);
      const jitter = ((seed * 37 + i * 13) % 17) / 17;
      points.push({
        time_dimension: time,
        dimension: name,
        metric: Math.round(base + amp * wave + amp * 0.25 * jitter),
      });
    });
  }
  return points;
};

const MODELS = [
  { name: "gpt-4o", base: 40_000, amp: 30_000 },
  { name: "claude-3-5-sonnet", base: 25_000, amp: 18_000 },
  { name: "gpt-4o-mini", base: 90_000, amp: 60_000 },
  { name: "llama-3-70b", base: 12_000, amp: 9_000 },
];

/** 14 daily buckets → date-mode axis ("Jun 22" … "Jul 5"). */
const dailyData = buildSeries(MODELS, 14, (i) => isoDay(i));
/** 24 hourly buckets in one day → time-mode axis ("2 AM" … "11 PM"). */
const hourlyData = buildSeries(MODELS, 24, (i) => isoDay(0, i));
/** Single-series variant of the daily data. */
const dailySingle = dailyData.filter((p) => p.dimension === "gpt-4o-mini");

/** Long observation-type names — the tooltip-truncation stress case. */
const longNameData = buildSeries(
  [
    { name: "sa-investigation:sa-evidence-verifier", base: 4_000, amp: 2_500 },
    { name: "tool-bash-loghouse-querylog-reader", base: 28_000, amp: 9_000 },
    { name: "step-loghouse-cplogs-aggregation-pass", base: 2_600, amp: 1_400 },
    { name: "tool-bash-dwh-resolve-org-membership", base: 700, amp: 420 },
    { name: "answer", base: 11_000, amp: 4_000 },
    { name: "step-write-io", base: 6_300, amp: 2_100 },
  ],
  14,
  (i) => isoDay(i),
);

// ── shared framing ───────────────────────────────────────────────────────────

const OptionCard = ({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-w-[340px] flex-1 flex-col gap-1">
    <div className="text-xs font-bold tracking-wide uppercase">{label}</div>
    <div className="bg-background h-[240px] w-full rounded-md border p-2">
      {children}
    </div>
    <div className="text-muted-foreground w-full text-xs">{caption}</div>
  </div>
);

/** A dashboard-widget-shaped card (title + description + plot). */
const WidgetCard = ({
  title,
  description,
  legendPosition,
  data,
}: {
  title: string;
  description: string;
  legendPosition: LegendPosition;
  data: DataPoint[];
}) => (
  <div className="bg-background flex h-[300px] w-[480px] flex-col rounded-lg border p-4">
    <span className="truncate font-bold">{title}</span>
    <div className="text-muted-foreground mb-2 truncate text-sm">
      {description}
    </div>
    <div className="min-h-0 flex-1">
      <LineChartTimeSeries data={data} legendPosition={legendPosition} />
    </div>
  </div>
);

/**
 * Raw-recharts stacked bar twin of `VerticalBarChartTimeSeries`, with the grid
 * exposed — the real component has NO grid today, so the variants have to be
 * drawn side-by-side here for the decision.
 */
const BarGridVariant = ({
  data,
  grid,
}: {
  data: DataPoint[];
  grid: "none" | "horizontal" | "both";
}) => {
  const grouped = groupDataByTimeDimension(data);
  const dimensions = [...new Set(data.map((p) => p.dimension ?? ""))];
  return (
    // ChartContainer so tick text/grid pick up the same CSS the real chart
    // gets — the variants must differ ONLY in the grid.
    <ChartContainer config={{}}>
      <BarChart data={grouped}>
        {grid !== "none" && (
          <CartesianGrid
            stroke="hsl(var(--chart-grid))"
            vertical={grid === "both"}
            syncWithTicks
          />
        )}
        <XAxis
          dataKey="time_dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          interval={2}
          tickFormatter={(v: string) =>
            new Date(v).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
        />
        <YAxis
          type="number"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          niceTicks="auto"
          tickFormatter={(value: number) =>
            toFullMetricString(formatMetric(value, { style: "compact" }))
          }
        />
        {dimensions.map((dimension, index) => (
          <Bar
            key={dimension}
            dataKey={dimension}
            stackId="stack"
            fill={seriesColor(index)}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
};

const ChartPolishDemo = (props: ChartProps) => (
  <LineChartTimeSeries {...props} />
);

const meta = preview.meta({
  title: "Design System/Charts/Polish (LFE-10576)",
  component: ChartPolishDemo,
});

// ── ⑤ Vertical grid lines ────────────────────────────────────────────────────

/**
 * DECIDED (Nikita, 2026-07-07): vertical lines on ALL temporal scales. They
 * land on the shown x ticks (`syncWithTicks`), so density follows the tick
 * budget; categorical axes stay clean.
 */
export const GridVerticalLines = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <OptionCard
        label="Date scale (days)"
        caption="One line per shown day tick — the ticket's ask."
      >
        <LineChartTimeSeries data={dailyData} legendPosition="none" />
      </OptionCard>
      <OptionCard
        label="Time scale (hours)"
        caption="Same rule zoomed into a day: a line per shown hour tick."
      >
        <LineChartTimeSeries data={hourlyData} legendPosition="none" />
      </OptionCard>
    </div>
  ),
});

// ── ⑤b Bar chart grid ────────────────────────────────────────────────────────

/** DECIDED (Nikita, 2026-07-07): horizontal only — first card is the real component. */
export const BarChartGrid = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <OptionCard
        label="Adopted: horizontal only"
        caption="y-gridlines make bar heights gaugeable; the bars themselves mark the x-rhythm."
      >
        <VerticalBarChartTimeSeries data={dailyData} legendPosition="none" />
      </OptionCard>
      <OptionCard
        label="Rejected: no grid"
        caption="The old bar time series — values were hard to gauge."
      >
        <BarGridVariant data={dailyData} grid="none" />
      </OptionCard>
      <OptionCard
        label="Rejected: horizontal + vertical"
        caption="Vertical lines fall between bars and only add noise."
      >
        <BarGridVariant data={dailyData} grid="both" />
      </OptionCard>
    </div>
  ),
});

// ── ④ Default legend visibility ──────────────────────────────────────────────

/**
 * DECIDED (Nikita, 2026-07-07): default is "auto" — a legend only when the
 * chart draws >1 series (a single-series legend just echoes the card title) —
 * and a rendered legend sits BELOW the plot. Dashboard widgets used to never
 * show a legend (old default "none") while the built-in home charts forced
 * one; "auto" heals that inconsistency without call-site changes.
 */
export const LegendDefaultVisibility = meta.story({
  render: () => (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex flex-wrap gap-4">
        <WidgetCard
          title="Total tokens"
          description="auto, single series → no legend"
          legendPosition="auto"
          data={dailySingle}
        />
        <WidgetCard
          title="Total tokens"
          description='single series, legend forced on ("below")'
          legendPosition="below"
          data={dailySingle}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <WidgetCard
          title="Total tokens by model"
          description='4 series, legend opted out ("none")'
          legendPosition="none"
          data={dailyData}
        />
        <WidgetCard
          title="Total tokens by model"
          description="auto, 4 series → legend below the plot"
          legendPosition="auto"
          data={dailyData}
        />
      </div>
    </div>
  ),
});

// ── ①②③ Tooltip placement / sizing (interactive) ─────────────────────────────

/**
 * Live check for the tooltip fixes: sweep the cursor left↔right across the
 * full chart width. The tooltip must keep a stable, readable width on both
 * sides of the flip (no all-ellipsis collapse near the right edge), the
 * proximity-highlighted row must not shift or re-truncate, and descenders
 * (g/y/p) must not lose their bottom pixel.
 */
export const TooltipEdgePlacement = meta.story({
  render: () => (
    <div className="bg-background w-[95vw] rounded-md border p-3">
      <div className="mb-1 text-sm font-bold">
        Hover near the right edge — long names, viewport-wide chart
      </div>
      <div className="h-[300px] w-full">
        <LineChartTimeSeries data={longNameData} legendPosition="below" />
      </div>
    </div>
  ),
});
