import preview from "../../../../.storybook/preview";
import { LineChartTimeSeries } from "./LineChartTimeSeries";
import { AreaChartTimeSeries } from "./AreaChartTimeSeries";
import { formatMetric } from "./utils";
import {
  type ChartProps,
  type DataPoint,
  type MetricFormatterFunction,
} from "./chart-props";

/**
 * Decision surface for LFE-10694: what a time-series chart shows on buckets
 * without data. Every dataset is deterministic and mirrors the PRODUCTION
 * data shape after the widget transforms: a series' missing bucket is an
 * ABSENT DataPoint (not a null metric), and a bucket where no series measured
 * anything arrives as a dimension-less bucket MARKER (`dimension: undefined,
 * metric: null`) — exactly what the query's gap-fill placeholder rows become.
 */

// ── data builders ────────────────────────────────────────────────────────────

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

const msFormatter: MetricFormatterFunction = (value, options) =>
  formatMetric(value, { ...options, unit: "millisecond" });

// One series, healthy on both sides of a 3-bucket hole (the classic lie shape).
const midRangeGap: SeriesSpec[] = [
  {
    name: "gpt-4o",
    values: [820, 940, 760, null, null, null, 880, 810, 990, 870],
  },
];

// Multi-series where the gaps don't line up — every bucket has SOME data, so
// only per-series cells are missing (no markers involved).
const staggeredGaps: SeriesSpec[] = [
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
const isolatedPoints: SeriesSpec[] = [
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

// Dense sanity: no gaps anywhere — the fix must be invisible here.
const dense: SeriesSpec[] = [
  {
    name: "gpt-4o",
    values: [820, 940, 760, 890, 830, 910, 880, 810, 990, 870],
  },
  {
    name: "claude-3-5-sonnet",
    values: [1450, 1380, 1520, 1490, 1400, 1440, 1470, 1390, 1510, 1460],
  },
  {
    name: "gpt-4o-mini",
    values: [310, 290, 340, 300, 320, 280, 330, 310, 290, 300],
  },
];

// ── layout helpers ───────────────────────────────────────────────────────────

const ExampleCard = ({
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

// Thin wrapper so the playground story's args infer at ChartProps (same
// escape hatch as LineChartTimeSeries.stories.tsx); it carries the card-sized
// box itself because story-level render/decorators don't typecheck through
// the CSF factory. The grid stories use `render` and ignore args.
const LineChartTimeSeriesDemo = (props: ChartProps) => (
  <div className="bg-background h-[320px] w-[640px] rounded-md border p-3">
    <LineChartTimeSeries {...props} />
  </div>
);

const meta = preview.meta({
  title: "Design System/Charts/Missing Data",
  component: LineChartTimeSeriesDemo,
  args: {
    data: buildGappedData(staggeredGaps),
    missingValue: "gap",
    connectNulls: false,
    legendPosition: "above",
    metricFormatter: msFormatter,
  },
});

// ── gap vs zero — the metric decides ─────────────────────────────────────────

export const GapVersusZero = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
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

// ── honest vs the old lie ────────────────────────────────────────────────────

export const HonestVersusBridged = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
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

// ── isolated points get a dot ────────────────────────────────────────────────

export const IsolatedPoints = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        label="neighborless values"
        caption="A value with gaps on both sides spans no line segment — the dot is what keeps it visible (first bucket, mid-gap, last bucket, and a stranded point after a segment)."
      >
        <LineChartTimeSeries
          data={buildGappedData(isolatedPoints)}
          missingValue="gap"
          legendPosition="above"
          metricFormatter={msFormatter}
        />
      </ExampleCard>
    </div>
  ),
});

// ── staggered per-series gaps ────────────────────────────────────────────────

export const StaggeredSeriesGaps = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        label="per-series gaps, every bucket has some data"
        caption="Each series breaks over its own missing buckets while the others keep drawing — no series borrows another's shape."
      >
        <LineChartTimeSeries
          data={buildGappedData(staggeredGaps)}
          missingValue="gap"
          legendPosition="above"
          metricFormatter={msFormatter}
        />
      </ExampleCard>
    </div>
  ),
});

// ── empty buckets stay on the axis ───────────────────────────────────────────

export const EmptyBucketsStayOnAxis = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        label="gap semantics"
        caption="Buckets 7/4–7/8 exist only as markers. The axis keeps them, so the empty era is visible instead of time compressing away."
      >
        <LineChartTimeSeries
          data={buildGappedData(twoEras)}
          missingValue="gap"
          legendPosition="above"
        />
      </ExampleCard>
      <ExampleCard
        label="zero semantics"
        caption="Same data as counts: the empty era reads as an honest flat 0, not as absence."
      >
        <LineChartTimeSeries
          data={buildGappedData(twoEras)}
          missingValue="zero"
          legendPosition="above"
          legendSummary="sum"
        />
      </ExampleCard>
    </div>
  ),
});

// ── area charts share the semantics ──────────────────────────────────────────

export const AreaVariants = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        label='area · missingValue="gap"'
        caption="The fill stops where the data stops; isolated values still get their dot."
      >
        <AreaChartTimeSeries
          data={buildGappedData(staggeredGaps)}
          missingValue="gap"
          subtleFill
          metricFormatter={msFormatter}
        />
      </ExampleCard>
      <ExampleCard
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

// ── dense data is untouched ──────────────────────────────────────────────────

export const DenseDataSanity = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-5 p-1">
      <ExampleCard
        label="no gaps anywhere"
        caption="With every cell measured, the fill pass changes nothing — straight segments through every real point."
      >
        <LineChartTimeSeries
          data={buildGappedData(dense)}
          missingValue="gap"
          legendPosition="above"
          metricFormatter={msFormatter}
        />
      </ExampleCard>
    </div>
  ),
});

// ── args-driven playground (flip missingValue / connectNulls in controls) ────

export const Playground = meta.story({
  args: {
    data: buildGappedData(staggeredGaps),
    missingValue: "gap",
    connectNulls: false,
  },
});
