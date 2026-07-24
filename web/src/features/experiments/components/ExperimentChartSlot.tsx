import { useMemo } from "react";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Button } from "@/src/components/ui/button";
import { WidgetContent } from "@/src/features/widgets/components/InlineWidget";
import { type QueryType } from "@langfuse/shared/query";
import type { MetricOption } from "../types/charts";
import { Skeleton } from "@/src/components/ui/skeleton";
import { buildWidgetConfigFromId } from "@/src/features/experiments/utils/charts";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

type ExperimentChartSlotProps = {
  chartIndex: number;
  selectedMetricId: string;
  onMetricChange: (metricId: string) => void;
  onRemove: () => void;
  canDelete: boolean;
  availableMetricOptions: MetricOption[];
  projectId: string;
  experiments: Array<{ id: string; name: string }>;
  fromTimestamp: Date;
  toTimestamp: Date;
  isExternalLoading?: boolean;
};

/**
 * A single chart slot with an embedded metric dropdown and hover-to-delete.
 */
export function ExperimentChartSlot({
  chartIndex,
  selectedMetricId,
  onMetricChange,
  onRemove,
  canDelete,
  availableMetricOptions,
  projectId,
  experiments,
  fromTimestamp,
  toTimestamp,
  isExternalLoading = false,
}: ExperimentChartSlotProps) {
  const { selectedMetricOption, widgetConfig } = useMemo(
    () => ({
      selectedMetricOption: availableMetricOptions.find(
        (opt) => opt.id === selectedMetricId,
      ),
      widgetConfig: buildWidgetConfigFromId(selectedMetricId),
    }),
    [availableMetricOptions, selectedMetricId],
  );

  const entityDimensionLabelMap = useMemo(
    () =>
      Object.fromEntries(
        experiments.map((experiment) => [experiment.id, experiment.name]),
      ),
    [experiments],
  );

  // Build query from widget config
  const query: QueryType | null = useMemo(() => {
    if (!widgetConfig) return null;

    const experimentIds = experiments.map((experiment) => experiment.id);
    const experimentNames = Array.from(
      new Set(
        experiments
          .map((experiment) => experiment.name)
          .filter((name) => name.length > 0),
      ),
    );
    const entityDimensionField = widgetConfig.entityDimension?.field;

    return {
      view: widgetConfig.view,
      dimensions: [...widgetConfig.dimensions],
      orderBy: widgetConfig.orderBy ? [...widgetConfig.orderBy] : null,
      timeDimension: widgetConfig.timeDimension,
      entityDimension: widgetConfig.entityDimension,
      metrics: widgetConfig.metrics.map((m) => ({
        measure: m.measure,
        aggregation: m.agg,
      })),
      filters: [
        ...(widgetConfig.filters ?? []),
        ...(entityDimensionField === "experimentName" &&
        experimentNames.length > 0
          ? [
              {
                column: "experimentName" as const,
                operator: "any of" as const,
                value: experimentNames,
                type: "stringOptions" as const,
              },
              {
                column: "experimentId" as const,
                operator: "any of" as const,
                value: experimentIds,
                type: "stringOptions" as const,
              },
            ]
          : []),
        ...(entityDimensionField === "datasetRunId"
          ? [
              {
                column: "datasetRunId" as const,
                operator: "any of" as const,
                value: experimentIds,
                type: "stringOptions" as const,
              },
            ]
          : []),
      ],
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
    };
  }, [widgetConfig, experiments, fromTimestamp, toTimestamp]);

  // Group options by their group for the dropdown
  const groupedOptions = useMemo(() => {
    const groups = new Map<MetricOption["group"], MetricOption[]>();

    for (const option of availableMetricOptions) {
      const existing = groups.get(option.group) ?? [];
      existing.push(option);
      groups.set(option.group, existing);
    }

    return groups;
  }, [availableMetricOptions]);

  // Get the selected option label for display
  // If not in available options, extract label from ID (for stale selections)
  const selectedLabel = useMemo(() => {
    if (selectedMetricOption) {
      return selectedMetricOption.label;
    }
    // Extract label from ID for stale selections
    if (selectedMetricId.startsWith("base:")) {
      return selectedMetricId === "base:cost" ? "Cost ($)" : "Latency (ms)";
    }
    // Score IDs like "obs-score-numeric:helpfulness" -> "helpfulness"
    const scoreName = selectedMetricId.split(":").pop();
    return scoreName ?? selectedMetricId;
  }, [selectedMetricOption, selectedMetricId]);

  // Check if metric is available for current experiments
  const isMetricAvailable = Boolean(selectedMetricOption);

  const isEnabled = experiments.length > 0;

  return (
    <div className="group relative">
      {/* Hover-to-delete button - fades in on hover */}
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="absolute top-1 right-1 z-10 h-6 w-6 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Header with dropdown */}
      <div className="flex items-center">
        <Select value={selectedMetricId} onValueChange={onMetricChange}>
          <SelectTrigger className="h-7 w-44 text-xs">
            <SelectValue placeholder="Select metric...">
              {selectedLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Array.from(groupedOptions.entries()).map(([group, options]) => (
              <SelectGroup key={group}>
                <SelectLabel className="text-xs font-bold">{group}</SelectLabel>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chart content area */}
      <div className="mt-1 flex h-56 flex-col">
        {isExternalLoading ? (
          <Skeleton className="h-[190px] w-full" />
        ) : !isMetricAvailable || !isEnabled ? (
          <NoDataOrLoading isLoading={false} className="h-[190px]" />
        ) : widgetConfig && query ? (
          <WidgetContent
            projectId={projectId}
            query={query}
            version={widgetConfig.minVersion}
            chartType={widgetConfig.chartType}
            chartConfig={widgetConfig.chartConfig}
            metrics={[...widgetConfig.metrics]}
            dimensions={[...widgetConfig.dimensions]}
            view={widgetConfig.view}
            schedulerId={`chart-slot-${chartIndex}-${selectedMetricId}`}
            isExternalLoading={isExternalLoading}
            layoutHint="compact"
            entityDimensionLabelMap={entityDimensionLabelMap}
            // Experiment names are long and add clutter on the x-axis; show them
            // on hover instead. The axis is always an entity (experiment/run)
            // dimension here.
            hideXAxisLabels={Boolean(widgetConfig.entityDimension)}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed">
            <span className="text-muted-foreground text-sm">
              Select a metric
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
