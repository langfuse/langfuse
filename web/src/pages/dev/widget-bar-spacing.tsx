// Dev-only test bed for dashboard widget chart spacing.
// Renders the HORIZONTAL_BAR widget chart in several spacing strategies at
// several row counts so the options can be compared side by side.
// Not linked from anywhere; visit /dev/widget-bar-spacing directly.
import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Check, Copy } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import {
  Bar,
  BarChart,
  LabelList,
  type RenderableText,
  XAxis,
  YAxis,
} from "recharts";
import { HorizontalBarChart } from "@/src/features/widgets/chart-library/HorizontalBarChart";
import {
  formatAxisLabel,
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";
import { barListToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { numberFormatter } from "@/src/utils/numbers";
import { copyTextToClipboard } from "@/src/utils/clipboard";

const TRACE_NAMES = [
  "in-app-agent-conversation",
  "agent-turn",
  "chat-completion",
  "generate-summary",
  "qa-retrieval",
  "classify-intent",
  "extract-entities",
  "rerank-documents",
  "embed-chunks",
  "guardrail-check",
  "tool-call-search",
  "tool-call-code",
  "prompt-experiment",
  "eval-run",
  "session-title",
  "autocomplete",
  "translate-message",
  "moderation",
  "healthcheck-probe",
  "batch-export",
];

function mockRows(n: number) {
  return TRACE_NAMES.slice(0, n).map((name, i) => ({
    name,
    value: Math.round(3306 / (1 + i * 0.55)),
  }));
}

// Constants mirrored from TracesBarListChart.tsx
const BAR_ROW_HEIGHT = 40;
const CHART_AXIS_PADDING = 30;

/**
 * Local copy of HorizontalBarChart with the bar sizing knobs exposed, so
 * variants can change maxBarSize / barCategoryGap without touching prod code.
 */
const TunableHorizontalBarChart: React.FC<{
  data: ReturnType<typeof barListToDataPoints>;
  maxBarSize?: number;
  barCategoryGap?: string | number;
}> = ({ data, maxBarSize, barCategoryGap = "12%" }) => {
  const formatValue = useCallback(
    (value: number) =>
      toFullMetricString(formatMetric(value, { style: "compact" })),
    [],
  );
  const rightMargin = useMemo(() => {
    if (!data?.length) return 8;
    const maxLabelLength = Math.max(
      ...data.map((d) => formatValue(Number(d.metric ?? 0)).length),
    );
    return Math.min(120, Math.max(20, maxLabelLength * 7 + 16));
  }, [data, formatValue]);

  return (
    <ChartContainer
      config={{
        metric: {
          theme: {
            light: "hsl(var(--chart-1))",
            dark: "hsl(var(--chart-1))",
          },
        },
      }}
      className="min-h-0 w-full"
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: rightMargin, bottom: 4, left: 0 }}
        barCategoryGap={barCategoryGap}
        barGap={4}
      >
        <XAxis
          type="number"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          niceTicks="auto"
          tickFormatter={(value) => formatValue(Number(value))}
        />
        <YAxis
          type="category"
          dataKey="dimension"
          stroke="hsl(var(--chart-grid))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={120}
          tick={({ x, y, payload }) => {
            const fullLabel =
              typeof payload === "string"
                ? payload
                : ((payload as { value?: string })?.value ?? String(payload));
            return (
              <g transform={`translate(${x},${y})`}>
                <title>{fullLabel}</title>
                <text
                  textAnchor="end"
                  x={0}
                  y={0}
                  dy={4}
                  fill="hsl(var(--muted-foreground))"
                  fontSize={12}
                >
                  {formatAxisLabel(fullLabel)}
                </text>
              </g>
            );
          }}
        />
        <Bar
          dataKey="metric"
          radius={[0, 4, 4, 0]}
          maxBarSize={maxBarSize}
          className="fill-(--color-metric)"
          isAnimationActive={false}
        >
          <LabelList
            dataKey="metric"
            position="right"
            formatter={(value: RenderableText) =>
              formatValue(Number(value ?? 0))
            }
            className="fill-muted-foreground"
            style={{ fontSize: 12 }}
          />
        </Bar>
        <ChartTooltip
          cursor={false}
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload}
              label={label}
              valueFormatter={(v) => formatValue(Number(v))}
            />
          )}
        />
      </BarChart>
    </ChartContainer>
  );
};

/** Hover-reveal copy button for a top-list row's dimension name. */
const CopyNameButton: React.FC<{ name: string }> = ({ name }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={`Copy "${name}"`}
      title={`Copy "${name}"`}
      className="text-muted-foreground hover:bg-background/60 hover:text-foreground pointer-events-auto rounded p-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
      onClick={async () => {
        try {
          await copyTextToClipboard(name);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch (error) {
          console.error("Unable to copy to clipboard", error);
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
};

/**
 * Top list: value in a left column, dimension label rendered on
 * top of the bar, rows top-aligned. Row height grows with available space up
 * to a threshold (MAX_ROW), shrinks down to MIN_ROW, then the list scrolls.
 */
const TopList: React.FC<{
  rows: { name: string; value: number }[];
  availableHeightPx: number;
  minRowPx?: number;
  maxRowPx?: number;
}> = ({ rows, availableHeightPx, minRowPx = 20, maxRowPx = 56 }) => {
  const GAP = 1;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fit = (availableHeightPx - GAP * (rows.length - 1)) / rows.length;
  const rowH = Math.max(minRowPx, Math.min(maxRowPx, Math.floor(fit)));
  const formatValue = (value: number) =>
    toFullMetricString(formatMetric(value, { style: "compact" }));
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-y-auto [&:has(>div:hover)>div:not(:hover)]:opacity-40"
      style={{ gap: GAP }}
    >
      {rows.map((r) => (
        <div
          key={r.name}
          className={`group/row hover:bg-accent/60 flex shrink-0 items-center gap-2 rounded-sm transition-opacity ${
            rowH >= 48 ? "text-base" : rowH >= 36 ? "text-sm" : "text-xs"
          }`}
          style={{ height: rowH }}
        >
          <div className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">
            {formatValue(r.value)}
          </div>
          <div className="relative h-full min-w-0 flex-1">
            <div
              className="h-full rounded-sm"
              style={{
                width: `${(r.value / max) * 100}%`,
                backgroundColor: "hsl(var(--chart-1) / 0.3)",
              }}
            />
            <span
              className="text-foreground absolute inset-y-0 left-2 flex items-center gap-1 text-sm whitespace-nowrap"
              title={r.name}
            >
              {r.name}
              <CopyNameButton name={r.name} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

/** Pure-CSS bar list (no Recharts): fixed compact rows, top-aligned. */
const CssBarList: React.FC<{ rows: { name: string; value: number }[] }> = ({
  rows,
}) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-2">
      {rows.map((r) => (
        <div key={r.name} className="flex shrink-0 items-center gap-2">
          <div
            className="text-muted-foreground w-[120px] shrink-0 truncate text-right text-xs"
            title={r.name}
          >
            {r.name}
          </div>
          <div className="relative h-6 flex-1">
            <div
              className="h-full rounded-r bg-[hsl(var(--chart-1))]"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <div className="text-muted-foreground w-12 shrink-0 text-xs">
            {numberFormatter(r.value, 0)}
          </div>
        </div>
      ))}
    </div>
  );
};

const TILE_HEADER_PX = 64;

const Tile: React.FC<{
  title: string;
  subtitle: string;
  heightPx: number;
  children: React.ReactNode;
}> = ({ title, subtitle, heightPx, children }) => (
  <div
    className="bg-card flex w-[420px] shrink-0 flex-col rounded-lg border p-4"
    style={{ height: heightPx }}
  >
    <div style={{ height: TILE_HEADER_PX - 16 }}>
      <div className="text-sm font-bold">{title}</div>
      <div className="text-muted-foreground text-xs">{subtitle}</div>
    </div>
    <div className="min-h-0 w-full flex-1">{children}</div>
  </div>
);

export default function WidgetBarSpacingTestPage() {
  const [tileHeight, setTileHeight] = useState(420);
  // ?variant=<key> renders only that variant, ?counts=2,5,10 overrides the
  // row counts, ?bare=1 hides page chrome (clean screenshots).
  const router = useRouter();
  const variantFilter =
    typeof router.query.variant === "string" ? router.query.variant : null;
  const counts =
    typeof router.query.counts === "string"
      ? router.query.counts
          .split(",")
          .map(Number)
          .filter((n) => n > 0)
      : [2, 3, 5, 10, 20];
  const bare = router.query.bare === "1";
  const chartAreaHeight = tileHeight - 16 * 2 - TILE_HEADER_PX + 16;

  const variants: {
    key: string;
    title: string;
    subtitle: string;
    render: (rows: { name: string; value: number }[]) => React.ReactNode;
  }[] = [
    {
      key: "current",
      title: "A · Current (bug)",
      subtitle: "bars spread across full tile height, 28px cap",
      render: (rows) => (
        <div className="h-full w-full">
          <HorizontalBarChart
            data={barListToDataPoints(rows)}
            showValueLabels
          />
        </div>
      ),
    },
    {
      key: "hug-top",
      title: "B · Hug rows, top-aligned",
      subtitle: `chart height = min(tile, rows × ${BAR_ROW_HEIGHT} + ${CHART_AXIS_PADDING})`,
      render: (rows) => (
        <div className="h-full w-full overflow-y-auto">
          <div
            className="w-full"
            style={{
              height: Math.min(
                chartAreaHeight,
                rows.length * BAR_ROW_HEIGHT + CHART_AXIS_PADDING,
              ),
            }}
          >
            <HorizontalBarChart
              data={barListToDataPoints(rows)}
              showValueLabels
            />
          </div>
        </div>
      ),
    },
    {
      key: "combo-bd",
      title: "G · B+D combo, capped (Recharts)",
      subtitle: "row band grows 40→64px with spare room, then top-aligns",
      render: (rows) => {
        const rowBand = Math.max(
          BAR_ROW_HEIGHT,
          Math.min(
            64,
            Math.floor((chartAreaHeight - CHART_AXIS_PADDING) / rows.length),
          ),
        );
        const chartHeight = Math.min(
          chartAreaHeight,
          rows.length * rowBand + CHART_AXIS_PADDING,
        );
        return (
          <div className="h-full w-full overflow-y-auto">
            <div className="w-full" style={{ height: chartHeight }}>
              <TunableHorizontalBarChart
                data={barListToDataPoints(rows)}
                maxBarSize={48}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: "top-list",
      title: "F · Top list",
      subtitle:
        "value left, label on bar; rows grow to max 56px, min 20px; hover row to copy name",
      render: (rows) => (
        <TopList rows={rows} availableHeightPx={chartAreaHeight} />
      ),
    },
    {
      key: "hug-center",
      title: "C · Hug rows, centered",
      subtitle: "same capped height, vertically centered in tile",
      render: (rows) => (
        <div className="flex h-full w-full flex-col justify-center overflow-y-auto">
          <div
            className="w-full shrink-0"
            style={{
              height: Math.min(
                chartAreaHeight,
                rows.length * BAR_ROW_HEIGHT + CHART_AXIS_PADDING,
              ),
            }}
          >
            <HorizontalBarChart
              data={barListToDataPoints(rows)}
              showValueLabels
            />
          </div>
        </div>
      ),
    },
    {
      key: "fill-uncapped",
      title: "D · Fill, uncapped bars",
      subtitle: "no maxBarSize; bars fatten to fill tile, 25% gap",
      render: (rows) => (
        <div className="h-full w-full">
          <TunableHorizontalBarChart
            data={barListToDataPoints(rows)}
            barCategoryGap="25%"
          />
        </div>
      ),
    },
    {
      key: "css-list",
      title: "E · CSS bar list",
      subtitle: "no Recharts; fixed 24px rows, top-aligned, scrolls",
      render: (rows) => <CssBarList rows={rows} />,
    },
  ];

  return (
    <div className="bg-background text-foreground min-h-screen p-8">
      {!bare && (
        <>
          <h1 className="text-xl font-bold">
            Dashboard widget bar chart spacing variants
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            Each section fixes the row count and shows all variants side by side
            in a tile the size of the Home &quot;Traces&quot; card. Variant A is
            today&apos;s behavior: Recharts distributes N category bands evenly
            over the full tile height and caps bar thickness at 28px, so few
            rows → bars pinned far apart.
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Tile height:</span>
            {[320, 420, 560].map((h) => (
              <button
                key={h}
                onClick={() => setTileHeight(h)}
                className={`rounded border px-2 py-1 ${
                  tileHeight === h
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
                }`}
              >
                {h}px
              </button>
            ))}
          </div>
        </>
      )}

      {counts.map((n) => {
        const rows = mockRows(n);
        return (
          <section key={n} className={bare ? "" : "mt-10"}>
            {!bare && <h2 className="mb-3 text-base font-bold">{n} rows</h2>}
            <div className="flex gap-4 overflow-x-auto pb-2">
              {variants
                .filter((v) => !variantFilter || v.key === variantFilter)
                .map((v) => (
                  <Tile
                    key={v.key}
                    title={v.title}
                    subtitle={v.subtitle}
                    heightPx={tileHeight}
                  >
                    {v.render(rows)}
                  </Tile>
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

WidgetBarSpacingTestPage.skipAppLayout = true;
