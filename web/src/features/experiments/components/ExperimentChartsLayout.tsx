import { MAX_EXPERIMENT_CHARTS } from "../constants/charts";
import { type ReactNode } from "react";
import { Plus } from "lucide-react";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@/src/components/ui/resizable";
import {
  type ExperimentChartSlot,
  useExperimentCharts,
} from "@/src/features/experiments/hooks/useExperimentCharts";
import { ExperimentMetricStrip } from "./ExperimentMetricStrip";
import {
  type MetricOption,
  type ScoreCoverageByLevel,
} from "@/src/features/experiments/types/charts";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { chartMetricChangedProps } from "@/src/features/experiments/lib/analytics";

const PANEL_IDS = ["charts", "table"];
type Props = {
  projectId: string;
  experiments: Array<{ id: string; name: string; startTime: Date }>;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  isExternalLoading?: boolean;
  scoreCoverage?: ScoreCoverageByLevel;
  availableMetricOptions: MetricOption[];
  isMetricOptionsLoading: boolean;
  metricOptionsError: string | null;
  onRetryMetricOptions: () => void;
  children: ReactNode;
};

export function ExperimentChartsLayout(props: Props) {
  if (!props.fromTimestamp || !props.toTimestamp) return <>{props.children}</>;
  return (
    <ChartsLayout
      key={props.projectId}
      {...props}
      fromTimestamp={props.fromTimestamp}
      toTimestamp={props.toTimestamp}
    />
  );
}

function ChartsLayout({
  children,
  projectId,
  availableMetricOptions,
  scoreCoverage,
  isExternalLoading,
  isMetricOptionsLoading,
  metricOptionsError,
  onRetryMetricOptions,
  ...chartProps
}: Props & { fromTimestamp: Date; toTimestamp: Date }) {
  const { charts, canAdd, addChart, removeChart, updateChart } =
    useExperimentCharts({ projectId, availableMetricOptions, scoreCoverage });
  const capture = usePostHogClientCapture();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `experiment-charts-size-${projectId}`,
    panelIds: PANEL_IDS,
    storage: "local",
  });
  const isLoading = isExternalLoading || isMetricOptionsLoading;
  const addChartTitle = (() => {
    if (canAdd) return "Add chart";
    if (charts.length >= MAX_EXPERIMENT_CHARTS)
      return `Maximum of ${MAX_EXPERIMENT_CHARTS} charts`;
    return "All available metrics are already shown";
  })();
  const handleAddChart = () => {
    addChart();
    capture("experiment:chart_added", {
      isV4: true,
      tableName: "experiments",
      chartCount: charts.length + 1,
    });
  };
  const renderChart = (slot: ExperimentChartSlot & { metricId: string }) => {
    const handleRemove = () => {
      removeChart(slot.id);
      capture("experiment:chart_removed", {
        isV4: true,
        tableName: "experiments",
        chartCount: charts.length - 1,
      });
    };
    const handleMetricChange = (metricId: string) => {
      if (metricId === slot.metricId) return;
      updateChart(slot.id, { metricId });
      capture(
        "experiment:chart_metric_changed",
        chartMetricChangedProps({
          tableName: "experiments",
          metricId,
        }),
      );
    };
    const handleChartTypeChange = (chartType: "line" | "bar") => {
      if (chartType === slot.chartType) return;
      updateChart(slot.id, { chartType });
      capture("experiment:chart_type_changed", {
        isV4: true,
        tableName: "experiments",
        chartType,
      });
    };
    return (
      <ExperimentMetricStrip
        key={slot.id}
        {...chartProps}
        projectId={projectId}
        availableMetricOptions={availableMetricOptions}
        slot={slot}
        canRemove={charts.length > 1}
        onRemove={handleRemove}
        onMetricChange={handleMetricChange}
        onChartTypeChange={handleChartTypeChange}
      />
    );
  };
  const renderCharts = () => {
    if (metricOptionsError)
      return (
        <div className="flex h-full items-center justify-center gap-2 text-xs">
          <span>Could not load chart metrics.</span>
          <Button
            text="Retry"
            variant="ghost"
            size="sm"
            onClick={onRetryMetricOptions}
          />
        </div>
      );
    if (isLoading)
      return (
        <div
          className="bg-muted h-full animate-pulse"
          aria-label="Loading charts"
        />
      );
    return (
      <div className="flex h-full min-h-0">
        <div className="grid min-w-0 flex-1 auto-cols-[minmax(260px,1fr)] grid-flow-col divide-x overflow-x-auto overflow-y-hidden">
          {charts.map(renderChart)}
        </div>
        <div className="shrink-0 border-l pt-1" title={addChartTitle}>
          <IconButton
            icon={Plus}
            label="Add chart"
            size="sm"
            disabled={!canAdd}
            onClick={handleAddChart}
          />
        </div>
      </div>
    );
  };
  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 flex-1"
    >
      <ResizablePanel
        id="charts"
        defaultSize="150px"
        minSize="130px"
        maxSize="70%"
      >
        <div className="h-full border-t">{renderCharts()}</div>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Resize charts and table" />
      <ResizablePanel id="table" minSize="150px">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
