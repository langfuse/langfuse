import preview from "../../../../.storybook/preview";
import { LineChartTimeSeries } from "./LineChartTimeSeries";
import { formatMetric } from "./utils";
import { type DataPoint, type MetricFormatterFunction } from "./chart-props";

// Shared time buckets so the synced crosshair lines up across panels (recharts
// syncId matches by index). Deterministic — no Math.random.
const HOURS = 48;
const labelAt = (i: number) => {
  const h = (13 + Math.floor(i / 2)) % 24;
  return `${String(h).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`;
};

const buildPanel = (
  series: { name: string; base: number; amp: number; spike?: number }[],
): DataPoint[] => {
  const points: DataPoint[] = [];
  for (let i = 0; i < HOURS; i++) {
    const time = labelAt(i);
    series.forEach(({ name, base, amp, spike }, seed) => {
      const wave = 0.5 + 0.5 * Math.sin((i + seed * 2.1) / 3.3);
      const jitter = ((seed * 31 + i * 17) % 13) / 13;
      const spikeAdd = spike && i === 30 ? spike : 0;
      points.push({
        time_dimension: time,
        dimension: name,
        metric: Math.round(base + amp * wave + amp * 0.3 * jitter + spikeAdd),
      });
    });
  }
  return points;
};

const requestsData = buildPanel([
  { name: "web", base: 14_000, amp: 6_000 },
  { name: "worker", base: 9_000, amp: 4_000 },
]);
const latencyData = buildPanel([
  { name: "post /api/chat-completion", base: 800, amp: 700, spike: 9_000 },
  { name: "get /api/traces", base: 300, amp: 200 },
  { name: "post /api/ingestion", base: 500, amp: 400 },
]);
const errorsData = buildPanel([{ name: "5xx", base: 1, amp: 3, spike: 8 }]);

// The common "spaghetti" case — many series at once. Magnitudes are spread so
// the lines occupy different vertical bands (good for the proximity highlight).
const spaghettiData = buildPanel(
  Array.from({ length: 14 }, (_, i) => ({
    name: `model-${String.fromCharCode(97 + i)}`,
    base: 150 + i * 120,
    amp: 80 + (i % 4) * 70,
  })),
);

const msFormatter: MetricFormatterFunction = (value, options) =>
  formatMetric(value, { ...options, unit: "millisecond" });

const PANELS: {
  title: string;
  data: DataPoint[];
  formatter?: MetricFormatterFunction;
}[] = [
  { title: "Requests", data: requestsData },
  { title: "p95 Latency", data: latencyData, formatter: msFormatter },
  { title: "Errors", data: errorsData },
];

/**
 * A mini-dashboard of charts that share a `syncId`. Hovering any panel drives a
 * synced vertical crosshair + tooltip across ALL panels at the same timestamp;
 * tooltips can escape a panel's bounds (allowEscapeViewBox). This is the
 * interactivity prototype for LFE-10549 — best viewed live, not as a screenshot.
 */
const SyncedDashboardDemo = ({
  syncId = "lfe10549-demo",
}: {
  syncId?: string;
}) => (
  <div className="flex flex-col gap-4">
    <p className="text-muted-foreground text-xs">
      Hover any chart — the time crosshair + tooltip track across all three.
    </p>
    {PANELS.map((panel) => (
      <div key={panel.title} className="bg-background rounded-md border p-3">
        <div className="mb-1 text-sm font-bold">{panel.title}</div>
        <div className="h-[180px] w-full">
          <LineChartTimeSeries
            data={panel.data}
            syncId={syncId}
            legendPosition="below"
            legendSummary="none"
            showDataPointDots={false}
            metricFormatter={panel.formatter}
          />
        </div>
      </div>
    ))}
  </div>
);

const meta = preview.meta({
  component: SyncedDashboardDemo,
  args: { syncId: "lfe10549-demo" },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
});

export const SyncedTimeline = meta.story({});

/**
 * The common overloaded case. Move the cursor vertically near a line: the
 * nearest line(s) emphasize and the rest dim; two lines within the pixel
 * threshold both light up; away from any line it renders normally.
 */
export const Spaghetti = meta.story({
  render: () => (
    <div className="bg-background h-[380px] w-full rounded-md border p-3">
      <div className="mb-1 text-sm font-bold">p95 Latency — 14 models</div>
      <div className="h-[330px] w-full">
        <LineChartTimeSeries
          data={spaghettiData}
          legendPosition="below"
          legendSummary="none"
          showDataPointDots={false}
          metricFormatter={msFormatter}
        />
      </div>
    </div>
  ),
});
