import React, { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import { cn } from "@/src/utils/tailwind";
import {
  type AggregationFn,
  type ChartViewConfig,
  type DimensionKey,
  type MetricKey,
  type PrototypeEvent,
  type TimeGranularity,
} from "../types";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  coerceConfig,
  DEFAULT_CONFIG,
  describeConfig,
  isTimeSeriesChartType,
} from "../vocab";
import { ChartCanvas } from "./ChartCanvas";
import {
  AggregationSelect,
  BreakdownSelect,
  ChartTypePicker,
  GranularitySelect,
  MetricSelect,
} from "./ConfigControls";
import { MockEventsTable } from "./MockEventsTable";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";
import { AskAiChartBar } from "./AskAiChartBar";

export type ChartViewAffordance = "inline" | "panel";

export interface ChartViewPrototypeProps {
  events: PrototypeEvent[];
  /** Which of the two config affordances to render. */
  affordance?: ChartViewAffordance;
  initialMode?: ViewMode;
  initialConfig?: Partial<ChartViewConfig>;
  showAskAi?: boolean;
  className?: string;
}

/**
 * The prototype root for "any view is a chart". Owns the two pieces of view
 * state — the table↔chart `mode` and the visualization `config` — and renders
 * one of two UX takes for the config affordance (`inline` bar vs. docked
 * `panel`). Everything below it is view-only; all data derivation lives in the
 * pure aggregator (`lib/aggregate.ts`). Phase 1 swaps `events` for the real v4
 * read path and moves `mode`/`config` into URL state; nothing else changes.
 */
export function ChartViewPrototype({
  events,
  affordance = "inline",
  initialMode = "chart",
  initialConfig,
  showAskAi = true,
  className,
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
  const applyAiConfig = useCallback((next: ChartViewConfig) => {
    setConfig(coerceConfig(next));
    setMode("chart");
  }, []);

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

  const isTimeSeries = isTimeSeriesChartType(config.chartType);

  return (
    <div
      className={cn(
        "bg-background flex h-full flex-col overflow-hidden rounded-lg border",
        className,
      )}
    >
      {/* Toolbar — the events view's chrome, slimmed to the parts that matter
          for this prototype: context on the left, the table↔chart toggle on
          the right. */}
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
          events={events}
          config={config}
          isTimeSeries={isTimeSeries}
          showAskAi={showAskAi}
          onMetric={onMetric}
          onAggregation={onAggregation}
          onBreakdown={onBreakdown}
          onChartType={onChartType}
          onGranularity={onGranularity}
          applyAiConfig={applyAiConfig}
        />
      ) : (
        <PanelTake
          events={events}
          config={config}
          isTimeSeries={isTimeSeries}
          showAskAi={showAskAi}
          onMetric={onMetric}
          onAggregation={onAggregation}
          onBreakdown={onBreakdown}
          onChartType={onChartType}
          onGranularity={onGranularity}
          applyAiConfig={applyAiConfig}
        />
      )}
    </div>
  );
}

interface TakeProps {
  events: PrototypeEvent[];
  config: ChartViewConfig;
  isTimeSeries: boolean;
  showAskAi: boolean;
  onMetric: (v: MetricKey) => void;
  onAggregation: (v: AggregationFn) => void;
  onBreakdown: (v: DimensionKey) => void;
  onChartType: (v: DashboardWidgetChartType) => void;
  onGranularity: (v: TimeGranularity) => void;
  applyAiConfig: (config: ChartViewConfig) => void;
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
  events,
  config,
  isTimeSeries,
  showAskAi,
  onMetric,
  onAggregation,
  onBreakdown,
  onChartType,
  onGranularity,
  applyAiConfig,
}: TakeProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showAskAi ? (
        <div className="border-b px-3 py-2">
          <AskAiChartBar onApply={applyAiConfig} variant="bar" />
        </div>
      ) : null}
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
      <ChartArea events={events} config={config} />
    </div>
  );
}

/** Take B — a clean, maximized canvas with config docked in a collapsible panel. */
function PanelTake({
  events,
  config,
  isTimeSeries,
  showAskAi,
  onMetric,
  onAggregation,
  onBreakdown,
  onChartType,
  onGranularity,
  applyAiConfig,
}: TakeProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-0 flex-1">
      <ChartArea events={events} config={config} />
      {open ? (
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Visualize</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse panel"
              onClick={() => setOpen(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {showAskAi ? (
            <AskAiChartBar onApply={applyAiConfig} variant="panel" />
          ) : null}
          <PanelField label="Chart type">
            <ChartTypePicker
              value={config.chartType}
              onChange={onChartType}
              showLabels
            />
          </PanelField>
          <PanelField label="Metric">
            <MetricSelect value={config.metric} onChange={onMetric} />
          </PanelField>
          <PanelField label="Aggregation">
            <AggregationSelect
              metric={config.metric}
              value={config.aggregation}
              onChange={onAggregation}
            />
          </PanelField>
          <PanelField label="Breakdown">
            <BreakdownSelect value={config.breakdown} onChange={onBreakdown} />
          </PanelField>
          <PanelField label="Granularity">
            <GranularitySelect
              value={config.timeGranularity}
              onChange={onGranularity}
              disabled={!isTimeSeries}
            />
          </PanelField>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-center border-l p-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Expand panel"
            onClick={() => setOpen(true)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function PanelField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

/** Shared canvas: the self-describing subtitle plus the chart itself. */
function ChartArea({
  events,
  config,
}: {
  events: PrototypeEvent[];
  config: ChartViewConfig;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 p-3">
      <div className="text-foreground text-sm font-medium">
        {describeConfig(config)}
      </div>
      <div className="min-h-0 flex-1">
        <ChartCanvas events={events} config={config} />
      </div>
    </div>
  );
}
