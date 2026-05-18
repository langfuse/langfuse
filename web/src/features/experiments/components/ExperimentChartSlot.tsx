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
import { type QueryType } from "@/src/features/query";
import {
  type MetricOption,
  buildWidgetConfigFromId,
} from "../hooks/useExperimentChartsGridSelection";
import { Skeleton } from "@/src/components/ui/skeleton";

type ExperimentChartSlotProps = {
  chartIndex: number;
  selectedMetricId: string;
  onMetricChange: (metricId: string) => void;
  onRemove: () => void;
  canDelete: boolean;
  availableMetricOptions: MetricOption[];
  projectId: string;
  experimentIds: string[];
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
  experimentIds,
  fromTimestamp,
  toTimestamp,
  isExternalLoading = false,
}: ExperimentChartSlotProps) {
  // Build widget config from selected metric ID
  const widgetConfig = useMemo(
    () => buildWidgetConfigFromId(selectedMetricId),
    [selectedMetricId],
  );

  // Build query from widget config
  const query: QueryType | null = useMemo(() => {
    if (!widgetConfig) return null;

    return {
      view: widgetConfig.view,
      dimensions: widgetConfig.dimensions,
      metrics: widgetConfig.metrics.map((m) => ({
        measure: m.measure,
        aggregation: m.aggregation,
      })),
      timeDimension: widgetConfig.timeDimension,
      entityDimension: widgetConfig.entityDimension,
      orderBy: widgetConfig.orderBy,
      filters: [
        ...(widgetConfig.filters ?? []),
        {
          column: "experimentId",
          operator: "any of" as const,
          value: experimentIds,
          type: "stringOptions" as const,
        },
      ],
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
    };
  }, [widgetConfig, experimentIds, fromTimestamp, toTimestamp]);

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
  const selectedLabel = useMemo(() => {
    const option = availableMetricOptions.find(
      (opt) => opt.id === selectedMetricId,
    );
    return option?.label ?? "Select metric...";
  }, [availableMetricOptions, selectedMetricId]);

  const isEnabled = experimentIds.length > 0;

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
                <SelectLabel className="text-xs font-semibold">
                  {group}
                </SelectLabel>
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
          <Skeleton className="h-full w-full" />
        ) : widgetConfig && query ? (
          <WidgetContent
            projectId={projectId}
            query={query}
            version={widgetConfig.version}
            chartType={widgetConfig.chartType}
            chartConfig={widgetConfig.chartConfig}
            metrics={widgetConfig.metrics}
            dimensions={widgetConfig.dimensions}
            view={widgetConfig.view}
            schedulerId={`chart-slot-${chartIndex}-${widgetConfig.schedulerId}`}
            isExternalLoading={isExternalLoading || !isEnabled}
            layoutHint="compact"
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
