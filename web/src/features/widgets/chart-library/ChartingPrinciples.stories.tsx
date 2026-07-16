import preview from "../../../../.storybook/preview";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { AreaChartTimeSeries } from "./AreaChartTimeSeries";
import { LineChartTimeSeries } from "./LineChartTimeSeries";
import { formatMetric } from "./utils";
import { type DataPoint, type MetricFormatterFunction } from "./chart-props";

/**
 * Illustrations for the charting-principles article (`ChartingPrinciples.mdx`).
 * The didactic ones (interpolation, null handling, certainty) draw raw recharts
 * so the contrast is unmistakable; the rest reuse the real
 * `LineChartTimeSeries` so the article shows production behavior, not a mockup.
 * Deterministic data only — no Math.random — so the renders are stable.
 */

// ── shared didactic data ─────────────────────────────────────────────────────
// Sparse + jagged so the interpolation choice is obvious at a glance.
const sparse = [
  { x: "1", y: 20 },
  { x: "2", y: 82 },
  { x: "3", y: 34 },
  { x: "4", y: 90 },
  { x: "5", y: 46 },
  { x: "6", y: 68 },
];

const ExampleCard = ({
  label,
  caption,
  tall = false,
  children,
}: {
  label: string;
  caption: string;
  /** Production-component demos need room for legends + axis labels. */
  tall?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={
      tall
        ? "flex min-w-[340px] flex-1 flex-col gap-1"
        : "flex min-w-[210px] flex-1 flex-col gap-1"
    }
  >
    <div className="text-xs font-bold tracking-wide uppercase">{label}</div>
    <div
      className={
        tall
          ? "bg-background h-[240px] w-full rounded-md border p-2"
          : "bg-background h-[150px] w-full rounded-md border p-2"
      }
    >
      {children}
    </div>
    <div className="text-muted-foreground w-full text-xs">{caption}</div>
  </div>
);

const axes = (
  <>
    <CartesianGrid stroke="hsl(var(--chart-grid))" vertical={false} />
    <XAxis
      dataKey="x"
      stroke="hsl(var(--chart-grid))"
      fontSize={11}
      tickLine={false}
      axisLine={false}
    />
    <YAxis
      stroke="hsl(var(--chart-grid))"
      fontSize={11}
      tickLine={false}
      axisLine={false}
      width={26}
    />
  </>
);

const meta = preview.meta({
  title: "Design System/Charts/Illustrations",
  component: LineChartTimeSeries,
});

// ── V1 · Draw what was measured ──────────────────────────────────────────────
export const Interpolation = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      {(
        [
          ["Straight", "linear", "What we measured. The honest default."],
          ["Smooth", "monotone", "Invents values between points. Opt-in only."],
          [
            "Stepped",
            "stepAfter",
            "Holds until it changes. For state/counters.",
          ],
        ] as const
      ).map(([label, type, caption]) => (
        <ExampleCard key={type} label={label} caption={caption}>
          <ResponsiveContainer>
            <LineChart data={sparse} margin={{ top: 8, right: 8, bottom: 0 }}>
              {axes}
              <Line
                type={type}
                dataKey="y"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ExampleCard>
      ))}
    </div>
  ),
});

// ── V2 · Missing is a gap, not a zero ────────────────────────────────────────
const withHole: { x: string; y: number | null }[] = [
  { x: "1", y: 30 },
  { x: "2", y: 58 },
  { x: "3", y: null },
  { x: "4", y: null },
  { x: "5", y: 62 },
  { x: "6", y: 40 },
];
const zeroFilled = withHole.map((d) => ({ ...d, y: d.y ?? 0 }));

export const NullHandling = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        label="Gap ✓"
        caption="Null breaks the line. The truth: no data here."
      >
        <ResponsiveContainer>
          <LineChart data={withHole} margin={{ top: 8, right: 8, bottom: 0 }}>
            {axes}
            <Line
              type="linear"
              dataKey="y"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ExampleCard>
      <ExampleCard
        label="Bridge"
        caption="Only when the series truly continues across the gap."
      >
        <ResponsiveContainer>
          <LineChart data={withHole} margin={{ top: 8, right: 8, bottom: 0 }}>
            {axes}
            <Line
              type="linear"
              dataKey="y"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ExampleCard>
      <ExampleCard
        label="Zero-fill ✗"
        caption="Invents a measurement of 0. A lie for anything non-additive; only counts/sums may fill zeros."
      >
        <ResponsiveContainer>
          <LineChart data={zeroFilled} margin={{ top: 8, right: 8, bottom: 0 }}>
            {axes}
            <Line
              type="linear"
              dataKey="y"
              stroke="hsl(var(--destructive))"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ExampleCard>
    </div>
  ),
});

// ── V3 · Encode certainty with one grammar ───────────────────────────────────
// `solid` = confirmed buckets; `faded` = still-aggregating tail (overlaps at the
// boundary so the dotted+pale segment touches the solid one).
const certainty = [
  { x: "1", solid: 32, faded: null as number | null },
  { x: "2", solid: 50, faded: null as number | null },
  { x: "3", solid: 44, faded: null as number | null },
  { x: "4", solid: 61, faded: 61 as number | null },
  { x: "5", solid: null as number | null, faded: 54 },
  { x: "6", solid: null as number | null, faded: 30 },
];

export const Certainty = meta.story({
  render: () => (
    <ExampleCard
      label="Confirmed vs. forming"
      caption="The still-aggregating tail is dotted + pale — present, but visibly less certain."
    >
      <ResponsiveContainer>
        <LineChart data={certainty} margin={{ top: 8, right: 8, bottom: 0 }}>
          {axes}
          <Line
            type="linear"
            dataKey="solid"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="faded"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            strokeOpacity={0.45}
            strokeDasharray="3 3"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ExampleCard>
  ),
});

// ── Reused production component (V4–V8) ───────────────────────────────────────
const msFormatter: MetricFormatterFunction = (value, options) =>
  formatMetric(value, { ...options, unit: "millisecond" });

const buildSeries = (
  series: { name: string; base: number; amp: number }[],
  days = 14,
): DataPoint[] => {
  const points: DataPoint[] = [];
  for (let day = 0; day < days; day++) {
    const label = `2026-06-${String(day + 1).padStart(2, "0")}T00:00:00Z`;
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

const fewSeries = buildSeries([
  { name: "gpt-4o", base: 800, amp: 600 },
  { name: "claude-3-5-sonnet", base: 1200, amp: 900 },
  { name: "gpt-4o-mini", base: 300, amp: 250 },
]);

// 30 series → over the render cap (25) → "Showing top 25 of 30 series".
const manySeries = buildSeries(
  Array.from({ length: 30 }, (_, i) => ({
    name: `model-${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}`,
    base: 200 + i * 70,
    amp: 120 + (i % 5) * 60,
  })),
);

const ChartFrame = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="bg-background rounded-md border p-3">
    <div className="mb-1 text-sm font-bold">{title}</div>
    <div className="h-[280px] w-full">{children}</div>
  </div>
);

// V4/V5 — hover snaps to a real sample; one synced crosshair, one tooltip.
export const HoverTimeline = meta.story({
  render: () => (
    <div className="flex flex-col gap-3 p-1">
      <ChartFrame title="p95 latency by model">
        <LineChartTimeSeries
          data={fewSeries}
          syncId="charting-principles"
          legendPosition="below"
          showDataPointDots={false}
          metricFormatter={msFormatter}
        />
      </ChartFrame>
      <ChartFrame title="requests by model (same timeline)">
        <LineChartTimeSeries
          data={buildSeries([
            { name: "gpt-4o", base: 14_000, amp: 6_000 },
            { name: "claude-3-5-sonnet", base: 9_000, amp: 4_000 },
            { name: "gpt-4o-mini", base: 22_000, amp: 8_000 },
          ])}
          syncId="charting-principles"
          legendPosition="below"
          showDataPointDots={false}
        />
      </ChartFrame>
    </div>
  ),
});

// V6/V7 — quiet chrome, identity color, adaptive labels (production component).
export const QuietChrome = meta.story({
  render: () => (
    <ChartFrame title="High data-ink: faint grid, no axis spine, muted labels">
      <LineChartTimeSeries
        data={fewSeries}
        legendPosition="below"
        showDataPointDots={false}
        metricFormatter={msFormatter}
      />
    </ChartFrame>
  ),
});

// V8 — bound the frame, not the data: top-N + an honest "N of M" note.
export const BoundTheFrame = meta.story({
  render: () => (
    <ChartFrame title="30 series in, 25 drawn — and it says so">
      <LineChartTimeSeries
        data={manySeries}
        legendPosition="below"
        showDataPointDots={false}
        metricFormatter={msFormatter}
      />
    </ChartFrame>
  ),
});

// ── V2 in production · missing data through the real components ─────────────
// These mirror the exact data shape the widget transforms hand the charts
// (LFE-10694): a series' missing bucket is an ABSENT DataPoint, and a bucket
// where nothing measured anything arrives as a dimension-less bucket MARKER
// (`dimension: undefined, metric: null`) — what the query's gap-fill
// placeholder rows become.

type SeriesSpec = {
  name: string;
  /** One entry per bucket; `null` = this series measured nothing there. */
  values: (number | null)[];
};

/** Buckets are day labels 7/1..7/N; markers keep all-empty buckets on the axis. */
const buildGappedData = (series: SeriesSpec[]): DataPoint[] => {
  const bucketCount = Math.max(...series.map((s) => s.values.length));
  const points: DataPoint[] = [];
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const label = `7/${bucket + 1}`;
    let bucketHasData = false;
    for (const { name, values } of series) {
      const value = values[bucket];
      if (value != null) {
        bucketHasData = true;
        points.push({ time_dimension: label, dimension: name, metric: value });
      }
    }
    if (!bucketHasData) {
      points.push({
        time_dimension: label,
        dimension: undefined,
        metric: null,
      });
    }
  }
  return points;
};

// One series, healthy on both sides of a 3-bucket hole (the classic lie shape).
const midRangeGap: SeriesSpec[] = [
  {
    name: "gpt-4o",
    values: [820, 940, 760, null, null, null, 880, 810, 990, 870],
  },
];

// Multi-series where the gaps don't line up — every bucket has SOME data, so
// only per-series cells are missing (no markers involved).
const staggeredGapSeries: SeriesSpec[] = [
  {
    name: "gpt-4o",
    values: [820, 940, 760, null, null, 830, 880, 810, 990, 870],
  },
  {
    name: "claude-3-5-sonnet",
    values: [1450, null, null, 1380, 1520, 1490, null, null, null, 1400],
  },
  {
    name: "gpt-4o-mini",
    values: [310, 290, 340, 300, null, null, null, 280, 320, 330],
  },
  {
    name: "mistral-7b",
    values: [null, null, 540, 560, 520, null, 580, 610, null, null],
  },
];

// Isolated points: a lone first bucket, a mid-gap single, a lone last bucket,
// and a series that is a segment plus one stranded value.
const isolatedPointSeries: SeriesSpec[] = [
  {
    name: "first-bucket-only",
    values: [720, null, null, null, null, null, null, null, null, null],
  },
  {
    name: "single-mid-gap",
    values: [null, null, null, null, 1350, null, null, null, null, null],
  },
  {
    name: "last-bucket-only",
    values: [null, null, null, null, null, null, null, null, null, 980],
  },
  {
    name: "segment-plus-stranded",
    values: [420, 460, 440, null, null, null, null, 510, null, null],
  },
];

// Long empty stretch (buckets exist only as markers) between two active eras.
const twoEras: SeriesSpec[] = [
  {
    name: "gpt-4o",
    values: [88, 96, 74, null, null, null, null, null, 91, 83],
  },
  {
    name: "claude-3-5-sonnet",
    values: [54, 61, null, null, null, null, null, null, 58, 66],
  },
];

export const GapVersusZero = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        tall
        label='missingValue="gap" (avg / percentiles)'
        caption="No latency exists on a bucket without generations — the line breaks. Fabricating a 0 would deflate the chart."
      >
        <LineChartTimeSeries
          data={buildGappedData(midRangeGap)}
          missingValue="gap"
          metricFormatter={msFormatter}
        />
      </ExampleCard>
      <ExampleCard
        tall
        label='missingValue="zero" (count / sum)'
        caption="Zero events on a bucket without data is the truth — the same shape stays continuous, touching 0."
      >
        <LineChartTimeSeries
          data={buildGappedData(midRangeGap)}
          missingValue="zero"
        />
      </ExampleCard>
    </div>
  ),
});

export const HonestVersusBridged = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        tall
        label="default (honest)"
        caption="Gap semantics: three empty buckets stay on the axis and the line breaks over them."
      >
        <LineChartTimeSeries
          data={buildGappedData(midRangeGap)}
          missingValue="gap"
          metricFormatter={msFormatter}
        />
      </ExampleCard>
      <ExampleCard
        tall
        label="connectNulls (the old default, now opt-in)"
        caption="The bridge draws values that were never measured. Reserved for series that semantically continue across a gap."
      >
        <LineChartTimeSeries
          data={buildGappedData(midRangeGap)}
          missingValue="gap"
          connectNulls
          metricFormatter={msFormatter}
        />
      </ExampleCard>
    </div>
  ),
});

export const IsolatedPoints = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        tall
        label="neighborless values"
        caption="A value with gaps on both sides spans no line segment — the dot is what keeps it visible (first bucket, mid-gap, last bucket, and a stranded point after a segment)."
      >
        <LineChartTimeSeries
          data={buildGappedData(isolatedPointSeries)}
          missingValue="gap"
          legendPosition="below"
          metricFormatter={msFormatter}
        />
      </ExampleCard>
    </div>
  ),
});

export const StaggeredSeriesGaps = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        tall
        label="per-series gaps, every bucket has some data"
        caption="Each series breaks over its own missing buckets while the others keep drawing — no series borrows another's shape."
      >
        <LineChartTimeSeries
          data={buildGappedData(staggeredGapSeries)}
          missingValue="gap"
          legendPosition="below"
          metricFormatter={msFormatter}
        />
      </ExampleCard>
    </div>
  ),
});

export const EmptyBucketsStayOnAxis = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        tall
        label="gap semantics"
        caption="Buckets 7/4–7/8 exist only as markers. The axis keeps them, so the empty era is visible instead of time compressing away."
      >
        <LineChartTimeSeries
          data={buildGappedData(twoEras)}
          missingValue="gap"
          legendPosition="below"
        />
      </ExampleCard>
      <ExampleCard
        tall
        label="zero semantics"
        caption="Same data as counts: the empty era reads as an honest flat 0, not as absence."
      >
        <LineChartTimeSeries
          data={buildGappedData(twoEras)}
          missingValue="zero"
          legendPosition="below"
          legendSummary="sum"
        />
      </ExampleCard>
    </div>
  ),
});

export const AreaGaps = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        tall
        label='area · missingValue="gap"'
        caption="The fill stops where the data stops; isolated values still get their dot."
      >
        <AreaChartTimeSeries
          data={buildGappedData(staggeredGapSeries)}
          missingValue="gap"
          subtleFill
          metricFormatter={msFormatter}
        />
      </ExampleCard>
      <ExampleCard
        tall
        label='area · missingValue="zero"'
        caption="Additive semantics: the fill dips to 0 across empty buckets."
      >
        <AreaChartTimeSeries
          data={buildGappedData(twoEras)}
          missingValue="zero"
          subtleFill
        />
      </ExampleCard>
    </div>
  ),
});
