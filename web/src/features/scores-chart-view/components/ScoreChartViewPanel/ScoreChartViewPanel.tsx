import React, { useCallback, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { Button } from "@/src/components/ui/button";
// Chart type picker is view-agnostic (only depends on `DashboardWidgetChartType`),
// so it's reused as-is rather than duplicated.
import { ChartTypePicker } from "@/src/features/chart-view/components/ConfigControls";
import { type AggregationFn } from "@/src/features/chart-view/types";
import { isTimeSeriesChartType } from "@/src/features/chart-view/vocab";
import {
  describeScoreChartConfig,
  getScoreMetric,
} from "@/src/features/scores-chart-view/fns/scoreChartConfig";
import {
  type ScoreChartDataset,
  type ScoreChartViewConfig,
  type ScoreDimensionKey,
  type ScoreMetricKey,
} from "@/src/features/scores-chart-view/types";
// Shared with the observations chart view: once a metric resolves to a
// label/unit, rendering an already-aggregated series is identical regardless
// of which vocabulary (events vs. scores) picked that metric.
import { ChartCanvas } from "@/src/features/chart-view/components/ChartCanvas";
import { DatasetSelect } from "@/src/features/scores-chart-view/components/DatasetSelect";
import { MetricSelect } from "@/src/features/scores-chart-view/components/MetricSelect";
import { AggregationSelect } from "@/src/features/scores-chart-view/components/AggregationSelect";
import { BreakdownSelect } from "@/src/features/scores-chart-view/components/BreakdownSelect";

/**
 * The scores-table chart layout — same "maximized canvas + collapsible config
 * panel" shape as the observations chart view's `ChartViewPanel`
 * (`@/src/features/chart-view`), reading the scores vocab instead. View-only:
 * data/loading/error come from the caller (`ScoresChartView`, which runs the
 * real aggregate query).
 */
export const ScoreChartViewPanel = React.memo(function ScoreChartViewPanel({
  config,
  onConfigChange,
  data,
  isLoading = false,
  error = null,
  emptyMessage,
  chartActions,
}: {
  config: ScoreChartViewConfig;
  onConfigChange: (patch: Partial<ScoreChartViewConfig>) => void;
  data: DataPoint[];
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  /** Right-aligned actions next to the chart subtitle (e.g. "Add to dashboard"). */
  chartActions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const metric = getScoreMetric(config.metric, config.dataset);

  const onDataset = useCallback(
    (dataset: ScoreChartDataset) => onConfigChange({ dataset }),
    [onConfigChange],
  );
  const onMetric = useCallback(
    (metric: ScoreMetricKey) => onConfigChange({ metric }),
    [onConfigChange],
  );
  const onAggregation = useCallback(
    (aggregation: AggregationFn) => onConfigChange({ aggregation }),
    [onConfigChange],
  );
  const onBreakdown = useCallback(
    (breakdown: ScoreDimensionKey) => onConfigChange({ breakdown }),
    [onConfigChange],
  );
  const onChartType = useCallback(
    (chartType: DashboardWidgetChartType) => onConfigChange({ chartType }),
    [onConfigChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex min-h-64 min-w-0 flex-1 flex-col gap-1 p-3 md:min-h-0">
        <div className="flex items-center justify-between gap-2">
          <div
            className="text-foreground min-w-0 truncate text-sm font-bold"
            title={describeScoreChartConfig(config)}
          >
            {describeScoreChartConfig(config)}
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
              chartType={config.chartType}
              breakdown={config.breakdown}
              aggregation={config.aggregation}
              metricLabel={metric.label}
              metricUnit={metric.unit}
              emptyMessage={
                emptyMessage ?? "No scores match the current filters."
              }
            />
          )}
        </div>
      </div>

      {open ? (
        <div className="flex w-full flex-col gap-3 overflow-y-auto border-t p-3 md:w-72 md:shrink-0 md:border-t-0 md:border-l">
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
          <PanelField label="View">
            <DatasetSelect value={config.dataset} onChange={onDataset} />
          </PanelField>
          {/* One "Metric" section holding both selects — matches the real
              dashboard widget builder's `SingleMetricField`, which nests the
              aggregation select directly under the measure select with no
              separate "Aggregation" label, and hides it entirely once the
              measure ("Count") has no other aggregation to offer. */}
          <PanelField label="Metric">
            <div className="flex flex-col gap-1.5">
              <MetricSelect
                dataset={config.dataset}
                value={config.metric}
                onChange={onMetric}
              />
              {metric.aggregations.length > 1 ? (
                <AggregationSelect
                  dataset={config.dataset}
                  metric={config.metric}
                  value={config.aggregation}
                  onChange={onAggregation}
                />
              ) : null}
            </div>
          </PanelField>
          <PanelField label="Breakdown">
            <BreakdownSelect
              dataset={config.dataset}
              isTimeSeries={isTimeSeriesChartType(config.chartType)}
              value={config.breakdown}
              onChange={onBreakdown}
            />
          </PanelField>
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
