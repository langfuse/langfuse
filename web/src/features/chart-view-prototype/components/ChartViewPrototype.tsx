import React, { useCallback, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
// Shared, production chart-view components — the harness renders the exact same
// UI as the real EventsChartView, fed with mock-aggregated data.
import {
  AggregationSelect,
  BreakdownSelect,
  ChartTypePicker,
  GranularitySelect,
  MetricSelect,
} from "@/src/features/chart-view/components/ConfigControls";
import { ChartCanvas } from "@/src/features/chart-view/components/ChartCanvas";
import { ChartViewPanel } from "@/src/features/chart-view/components/ChartViewPanel";
import { ViewModeToggle } from "@/src/features/chart-view/components/ViewModeToggle";
import {
  coerceConfig,
  DEFAULT_CONFIG,
  describeConfig,
  isTimeSeriesChartType,
} from "@/src/features/chart-view/vocab";
import {
  type AggregationFn,
  type ChartViewConfig,
  type DimensionKey,
  type MetricKey,
  type PrototypeEvent,
  type TimeGranularity,
  type ViewMode,
} from "../types";
import { aggregateEvents } from "../lib/aggregate";
import { MockEventsTable } from "./MockEventsTable";

export type ChartViewAffordance = "inline" | "panel";

export interface ChartViewPrototypeProps {
  events: PrototypeEvent[];
  /** Which of the two config affordances to render. */
  affordance?: ChartViewAffordance;
  initialMode?: ViewMode;
  initialConfig?: Partial<ChartViewConfig>;
}

/**
 * Storybook design harness for "any view is a chart". Owns the table↔chart
 * `mode` and the `config` (production uses URL state instead), derives chart
 * data from mock events via the pure aggregator, and renders one of the two UX
 * takes. Take B — the docked panel Nikita picked — is the shared, production
 * `ChartViewPanel`; Take A (inline bar) is kept here as the design record.
 */
export function ChartViewPrototype({
  events,
  affordance = "inline",
  initialMode = "chart",
  initialConfig,
}: ChartViewPrototypeProps) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [config, setConfig] = useState<ChartViewConfig>(() =>
    coerceConfig({ ...DEFAULT_CONFIG, ...initialConfig }),
  );

  const patchConfig = useCallback(
    (patch: Partial<ChartViewConfig>) =>
      setConfig((prev) => coerceConfig({ ...prev, ...patch })),
    [],
  );

  const data = useMemo(() => aggregateEvents(events, config), [events, config]);
  const isTimeSeries = isTimeSeriesChartType(config.chartType);

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden rounded-lg border">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Button variant="outline" size="sm" disabled className="h-7 gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </Button>
          <span>{events.length.toLocaleString()} events · last 24h</span>
        </div>
        <ViewModeToggle mode={mode} onModeChange={setMode} />
      </div>

      {mode === "table" ? (
        <MockEventsTable events={events} />
      ) : affordance === "inline" ? (
        <InlineTake
          data={data}
          config={config}
          isTimeSeries={isTimeSeries}
          patchConfig={patchConfig}
        />
      ) : (
        <ChartViewPanel
          config={config}
          onConfigChange={patchConfig}
          data={data}
          granularitySlot={
            <GranularitySelect
              value={config.timeGranularity}
              onChange={(timeGranularity) => patchConfig({ timeGranularity })}
              disabled={!isTimeSeries}
            />
          }
        />
      )}
    </div>
  );
}

function InlineField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

/** Take A — everything in a compact, always-visible bar above the canvas. */
function InlineTake({
  data,
  config,
  isTimeSeries,
  patchConfig,
}: {
  data: ReturnType<typeof aggregateEvents>;
  config: ChartViewConfig;
  isTimeSeries: boolean;
  patchConfig: (patch: Partial<ChartViewConfig>) => void;
}) {
  const onMetric = useCallback(
    (metric: MetricKey) => patchConfig({ metric }),
    [patchConfig],
  );
  const onAggregation = useCallback(
    (aggregation: AggregationFn) => patchConfig({ aggregation }),
    [patchConfig],
  );
  const onBreakdown = useCallback(
    (breakdown: DimensionKey) => patchConfig({ breakdown }),
    [patchConfig],
  );
  const onChartType = useCallback(
    (chartType: DashboardWidgetChartType) => patchConfig({ chartType }),
    [patchConfig],
  );
  const onGranularity = useCallback(
    (timeGranularity: TimeGranularity) => patchConfig({ timeGranularity }),
    [patchConfig],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
        <ChartTypePicker value={config.chartType} onChange={onChartType} />
        <Separator orientation="vertical" className="h-5" />
        <InlineField label="Metric">
          <MetricSelect value={config.metric} onChange={onMetric} />
        </InlineField>
        <InlineField label="Aggregation">
          <AggregationSelect
            metric={config.metric}
            value={config.aggregation}
            onChange={onAggregation}
          />
        </InlineField>
        <InlineField label="by">
          <BreakdownSelect value={config.breakdown} onChange={onBreakdown} />
        </InlineField>
        <InlineField label="every">
          <GranularitySelect
            value={config.timeGranularity}
            onChange={onGranularity}
            disabled={!isTimeSeries}
          />
        </InlineField>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="text-foreground text-sm font-bold">
          {describeConfig(config)}
        </div>
        <div className="min-h-0 flex-1">
          <ChartCanvas data={data} config={config} />
        </div>
      </div>
    </div>
  );
}
