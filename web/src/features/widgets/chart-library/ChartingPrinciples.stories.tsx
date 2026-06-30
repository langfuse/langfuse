import preview from "../../../../.storybook/preview";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
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

const Mini = ({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <div className="text-xs font-bold tracking-wide uppercase">{label}</div>
    <div className="bg-background h-[150px] w-[210px] rounded-md border p-2">
      {children}
    </div>
    <div className="text-muted-foreground w-[210px] text-xs">{caption}</div>
  </div>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap gap-5">{children}</div>
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
  decorators: [
    (Story) => (
      <div className="max-w-[720px] p-1">
        <Story />
      </div>
    ),
  ],
});

// ── V1 · Draw what was measured ──────────────────────────────────────────────
export const Interpolation = meta.story({
  render: () => (
    <Row>
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
        <Mini key={type} label={label} caption={caption}>
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
        </Mini>
      ))}
    </Row>
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
    <Row>
      <Mini
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
      </Mini>
      <Mini
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
      </Mini>
      <Mini
        label="Zero-fill ✗"
        caption="Invents a measurement of 0. A lie, unless stacking demands it."
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
      </Mini>
    </Row>
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
    <Mini
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
    </Mini>
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

const Frame = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="bg-background w-[680px] rounded-md border p-3">
    <div className="mb-1 text-sm font-medium">{title}</div>
    <div className="h-[280px] w-full">{children}</div>
  </div>
);

// V4/V5 — hover snaps to a real sample; one synced crosshair, one tooltip.
export const HoverTimeline = meta.story({
  render: () => (
    <div className="flex flex-col gap-3">
      <Frame title="p95 latency by model">
        <LineChartTimeSeries
          data={fewSeries}
          syncId="charting-principles"
          legendPosition="above"
          showDataPointDots={false}
          metricFormatter={msFormatter}
        />
      </Frame>
      <Frame title="requests by model (same timeline)">
        <LineChartTimeSeries
          data={buildSeries([
            { name: "gpt-4o", base: 14_000, amp: 6_000 },
            { name: "claude-3-5-sonnet", base: 9_000, amp: 4_000 },
            { name: "gpt-4o-mini", base: 22_000, amp: 8_000 },
          ])}
          syncId="charting-principles"
          legendPosition="above"
          showDataPointDots={false}
        />
      </Frame>
    </div>
  ),
});

// V6/V7 — quiet chrome, identity color, adaptive labels (production component).
export const QuietChrome = meta.story({
  render: () => (
    <Frame title="High data-ink: faint grid, no axis spine, muted labels">
      <LineChartTimeSeries
        data={fewSeries}
        legendPosition="above"
        showDataPointDots={false}
        metricFormatter={msFormatter}
      />
    </Frame>
  ),
});

// V8 — bound the frame, not the data: top-N + an honest "N of M" note.
export const BoundTheFrame = meta.story({
  render: () => (
    <Frame title="30 series in, 25 drawn — and it says so">
      <LineChartTimeSeries
        data={manySeries}
        legendPosition="above"
        showDataPointDots={false}
        metricFormatter={msFormatter}
      />
    </Frame>
  ),
});
