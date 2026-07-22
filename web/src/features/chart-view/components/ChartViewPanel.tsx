import React, { useCallback, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { Button } from "@/src/components/ui/button";
import {
  type AggregationFn,
  type ChartViewConfig,
  type DimensionKey,
  type MetricKey,
} from "../types";
import { describeConfig } from "../vocab";
import { ChartCanvas } from "./ChartCanvas";
import {
  AggregationSelect,
  BreakdownSelect,
  ChartTypePicker,
  MetricSelect,
} from "./ConfigControls";

/**
 * The "Take B" chart-view layout (the direction Nikita picked): a maximized
 * chart canvas with the visualization config docked in a collapsible right-hand
 * panel. View-only — `data` and the loading/error state are supplied by the
 * caller (the server query in production, the mock aggregator in Storybook).
 * Optional `granularitySlot` lets a caller add a granularity control without
 * forking the layout.
 */
export const ChartViewPanel = React.memo(function ChartViewPanel({
  config,
  onConfigChange,
  data,
  isLoading = false,
  error = null,
  emptyMessage,
  granularitySlot,
  chartActions,
}: {
  config: ChartViewConfig;
  onConfigChange: (patch: Partial<ChartViewConfig>) => void;
  data: DataPoint[];
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  granularitySlot?: React.ReactNode;
  /** Right-aligned actions next to the chart subtitle (e.g. "Add to dashboard"). */
  chartActions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  const onMetric = useCallback(
    (metric: MetricKey) => onConfigChange({ metric }),
    [onConfigChange],
  );
  const onAggregation = useCallback(
    (aggregation: AggregationFn) => onConfigChange({ aggregation }),
    [onConfigChange],
  );
  const onBreakdown = useCallback(
    (breakdown: DimensionKey) => onConfigChange({ breakdown }),
    [onConfigChange],
  );
  const onChartType = useCallback(
    (chartType: DashboardWidgetChartType) => onConfigChange({ chartType }),
    [onConfigChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Canvas */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <div
            className="text-foreground min-w-0 truncate text-sm font-bold"
            title={describeConfig(config)}
          >
            {describeConfig(config)}
          </div>
          {chartActions}
        </div>
        <div className="min-h-0 flex-1">
          {error ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertCircle className="h-10 w-10 opacity-40" />
              <p className="max-w-md text-sm">{error}</p>
            </div>
          ) : isLoading ? (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <ChartCanvas
              data={data}
              config={config}
              emptyMessage={emptyMessage}
            />
          )}
        </div>
      </div>

      {/* Config panel */}
      {open ? (
        <div className="flex w-full flex-col gap-3 overflow-y-auto border-b p-3 md:w-72 md:shrink-0 md:border-b-0 md:border-l">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Visualize</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse panel"
              onClick={() => setOpen(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
          {granularitySlot ? (
            <PanelField label="Granularity">{granularitySlot}</PanelField>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center border-t p-1.5 md:shrink-0 md:border-t-0 md:border-l">
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
});

function PanelField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-bold">{label}</span>
      {children}
    </div>
  );
}
