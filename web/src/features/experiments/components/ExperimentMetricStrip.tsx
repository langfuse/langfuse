import { useMemo } from "react";
import { X } from "lucide-react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { ScoreTag } from "@/src/components/score-tag";
import { WidgetContent } from "@/src/features/widgets";
import { type QueryType } from "@langfuse/shared/query";
import { type MetricOption } from "@/src/features/experiments/types/charts";
import { buildWidgetConfigFromId } from "@/src/features/experiments/utils/charts";
import { SCORE_LEVEL_TAGS } from "@/src/features/experiments/constants/charts";
import { MetricStripMessage } from "@/src/components/metric-strip/MetricStripBand";
import {
  METRIC_STRIP_TRIGGER_CLASS,
  metricStripTriggerClasses,
} from "@/src/components/metric-strip/MetricStripTrigger";
import { cn } from "@/src/utils/tailwind";
import { type ExperimentChartSlot } from "@/src/features/experiments/hooks/useExperimentCharts";

const EMPTY_PLOT = (
  <MetricStripMessage message="No values for these experiments" />
);
export function ExperimentMetricStrip({
  projectId,
  experiments,
  fromTimestamp,
  toTimestamp,
  availableMetricOptions,
  slot,
  onMetricChange,
  onChartTypeChange,
  onRemove,
  canRemove,
}: {
  projectId: string;
  experiments: Array<{ id: string; name: string; startTime: Date }>;
  fromTimestamp: Date;
  toTimestamp: Date;
  availableMetricOptions: MetricOption[];
  slot: ExperimentChartSlot & { metricId: string };
  onMetricChange: (metricId: string) => void;
  onChartTypeChange: (chartType: "line" | "bar") => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const orderedExperiments = useMemo(
    () =>
      [...experiments].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      ),
    [experiments],
  );
  const selectedOption = availableMetricOptions.find(
    (option) => option.id === slot.metricId,
  );
  const widgetConfig = useMemo(
    () => buildWidgetConfigFromId(slot.metricId),
    [slot.metricId],
  );
  const label =
    selectedOption?.label ??
    slot.metricId.substring(slot.metricId.indexOf(":") + 1);
  const isCategorical =
    selectedOption?.valueKind === "categorical" ||
    slot.metricId.includes("-score-categorical:");
  const showLevels =
    new Set(
      availableMetricOptions.flatMap((option) =>
        option.level ? [option.level] : [],
      ),
    ).size > 1;
  const chartType = (() => {
    if (isCategorical) return "BAR_TIME_SERIES" as const;
    return slot.chartType === "bar"
      ? ("VERTICAL_BAR" as const)
      : ("LINE_TIME_SERIES" as const);
  })();
  const entityDimensionLabelMap = useMemo(
    () =>
      Object.fromEntries(
        orderedExperiments.map((experiment) => [
          experiment.id,
          experiment.name,
        ]),
      ),
    [orderedExperiments],
  );
  const query = useMemo((): QueryType | null => {
    if (!widgetConfig) return null;
    return {
      view: widgetConfig.view,
      dimensions: [...widgetConfig.dimensions],
      orderBy: null,
      timeDimension: widgetConfig.timeDimension,
      entityDimension: widgetConfig.entityDimension,
      metrics: widgetConfig.metrics.map((metric) => ({
        measure: metric.measure,
        aggregation: metric.agg,
      })),
      filters: [
        ...widgetConfig.filters,
        ...(widgetConfig.entityDimension.field === "experimentName"
          ? [
              {
                column: "experimentName",
                operator: "any of" as const,
                type: "stringOptions" as const,
                value: orderedExperiments.map((experiment) => experiment.name),
              },
            ]
          : []),
        {
          column:
            widgetConfig.entityDimension.field === "datasetRunId"
              ? "datasetRunId"
              : "experimentId",
          operator: "any of",
          type: "stringOptions",
          value: orderedExperiments.map((experiment) => experiment.id),
        },
      ],
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
    };
  }, [widgetConfig, orderedExperiments, fromTimestamp, toTimestamp]);

  const handleChartTypeChange = (value: string) => {
    if (value === "line" || value === "bar") onChartTypeChange(value);
  };

  return (
    <section
      className="group/chart flex h-full min-h-[130px] min-w-0 flex-col"
      aria-label={`Chart: ${label}`}
    >
      <div className="flex min-h-8 min-w-0 items-center gap-1.5 pl-2">
        <div className="min-w-0 flex-1">
          <Select value={slot.metricId} onValueChange={onMetricChange}>
            <SelectTrigger
              aria-label="Chart metric"
              className={cn(
                METRIC_STRIP_TRIGGER_CLASS,
                metricStripTriggerClasses.metric,
                "h-auto w-auto max-w-full justify-start border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0",
              )}
              hideDownIcon
            >
              <SelectValue>
                <span className="truncate" title={label}>
                  {label}
                </span>
              </SelectValue>
              {showLevels && selectedOption?.level && (
                <ScoreTag level={SCORE_LEVEL_TAGS[selectedOption.level]} />
              )}
              <DropdownIndicator size="sm" nudge />
            </SelectTrigger>
            <SelectContent>
              {!selectedOption && (
                <SelectItem value={slot.metricId} disabled>
                  {label} (unavailable)
                </SelectItem>
              )}
              {(["Scores", "Base Metrics"] as const).map((group) => (
                <SelectGroup key={group}>
                  <SelectLabel className="text-xs font-bold">
                    {group}
                  </SelectLabel>
                  {availableMetricOptions
                    .filter((option) => option.group === group)
                    .map((option) => (
                      <SelectItem
                        key={option.id}
                        value={option.id}
                        textValue={option.label}
                      >
                        <span className="flex items-center gap-1.5">
                          {showLevels && option.level && (
                            <ScoreTag level={SCORE_LEVEL_TAGS[option.level]} />
                          )}
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isCategorical && (
          <Select value={slot.chartType} onValueChange={handleChartTypeChange}>
            <SelectTrigger
              aria-label="Chart type"
              className="h-6 w-auto gap-1 border-0 px-1 text-xs opacity-0 shadow-none group-focus-within/chart:opacity-100 group-hover/chart:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
            </SelectContent>
          </Select>
        )}
        {canRemove && (
          <div className="opacity-0 group-focus-within/chart:opacity-100 group-hover/chart:opacity-100 [@media(hover:none)]:opacity-100">
            <IconButton
              icon={X}
              label={`Remove ${label} chart`}
              size="sm"
              onClick={onRemove}
            />
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {selectedOption && query && widgetConfig && experiments.length > 0 ? (
          <WidgetContent
            projectId={projectId}
            query={query}
            version={widgetConfig.minVersion}
            chartType={chartType}
            chartConfig={
              chartType === "LINE_TIME_SERIES"
                ? { type: chartType, show_data_point_dots: true }
                : { type: chartType }
            }
            metrics={[...widgetConfig.metrics]}
            dimensions={[...widgetConfig.dimensions]}
            view={widgetConfig.view}
            schedulerId={`experiments-chart-${slot.id}`}
            layoutHint="tight"
            entityDimensionLabelMap={entityDimensionLabelMap}
            emptyState={EMPTY_PLOT}
            legendPosition="none"
            colorBarsByCategory={chartType === "VERTICAL_BAR"}
            zeroBaseline={chartType !== "LINE_TIME_SERIES"}
          />
        ) : (
          <MetricStripMessage
            message={
              experiments.length === 0
                ? "No experiments in view"
                : "No values for these experiments"
            }
          />
        )}
      </div>
    </section>
  );
}
