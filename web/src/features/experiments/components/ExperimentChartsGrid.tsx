import { Plus } from "lucide-react";
import { useMemo } from "react";
import { ExperimentChartSlot } from "./ExperimentChartSlot";
import { useExperimentChartsGridSelection } from "../hooks/useExperimentChartsGridSelection";

type ExperimentChartsGridProps = {
  projectId: string;
  experiments: Array<{ id: string; name: string }>;
  fromTimestamp: Date;
  toTimestamp: Date;
  isExternalLoading?: boolean;
};

/**
 * Compact Add Button - small inline button to add a new chart.
 */
function AddChartButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50 flex h-56 w-12 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors duration-200"
    >
      <Plus className="text-muted-foreground/50 h-5 w-5" />
    </button>
  );
}

/**
 * Get grid template columns based on chart count.
 * Uses responsive layouts with min 300px per chart.
 * - 4 charts: xl+ for 1x4, md+ for 2x2 (always wraps in pairs, never 3+1)
 * - 3 charts + add: lg+ for full row, md for 2-col wrap
 * - 2 charts + add: md+ for full row
 * - 1 chart + add: sm+ for full row
 */
function getGridClass(chartCount: number): string {
  if (chartCount === 4) {
    // 4 charts: xl+ (1280px) for 1x4, md+ for 2x2, mobile stacked
    // Uses explicit breakpoints to ensure charts wrap in pairs (never 3+1)
    return "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4";
  }
  if (chartCount === 3) {
    // 3 charts + add button: lg+ (1024px) for full row, md for 2-col
    return "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]";
  }
  if (chartCount === 2) {
    // 2 charts + add button: md+ (768px) for full row
    return "grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]";
  }
  // 1 chart + add button: sm+ (640px) for full row
  return "grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]";
}

/**
 * A responsive grid for experiment charts with dynamic add/remove.
 * - Max 4 charts
 * - Layout: adapts based on chart count
 * - Compact add button inline at the end
 * - Hover-to-delete on each chart
 */
export function ExperimentChartsGrid({
  projectId,
  experiments,
  fromTimestamp,
  toTimestamp,
  isExternalLoading = false,
}: ExperimentChartsGridProps) {
  const experimentIds = useMemo(
    () => experiments.map((experiment) => experiment.id),
    [experiments],
  );
  const {
    charts,
    updateChart,
    addChart,
    removeChart,
    canAddChart,
    canDeleteChart,
    availableMetricOptions,
    isLoading,
  } = useExperimentChartsGridSelection({
    projectId,
    experimentIds,
  });

  const gridClass = getGridClass(charts.length);

  return (
    <div className={gridClass}>
      {/* Active chart slots */}
      {charts.map((metricId, index) => (
        <ExperimentChartSlot
          key={`${index}-${metricId}`}
          chartIndex={index}
          selectedMetricId={metricId}
          onMetricChange={(newMetricId) => updateChart(index, newMetricId)}
          onRemove={() => removeChart(index)}
          canDelete={canDeleteChart}
          availableMetricOptions={availableMetricOptions}
          projectId={projectId}
          experiments={experiments}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isExternalLoading={isExternalLoading || isLoading}
        />
      ))}

      {/* Compact Add Button - inline at the end */}
      {canAddChart && <AddChartButton onClick={addChart} />}
    </div>
  );
}
