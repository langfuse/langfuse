import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import DocPopup from "@/src/components/layouts/doc-popup";
import { WidgetContent } from "@/src/features/widgets/components/InlineWidget";
import { type QueryType } from "@langfuse/shared/query";
import type { MetricOption } from "@/src/features/experiments/types/charts";
import { Skeleton } from "@/src/components/ui/skeleton";
import { buildWidgetConfigFromId } from "@/src/features/experiments/utils/charts";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { useExperimentStripMetric } from "@/src/features/experiments/hooks/useExperimentStripMetric";

const AXIS_EXPLANATION =
  "One point per experiment, left to right in the order of the table below — sorting or filtering the table re-orders the chart. Experiments with no value for this metric are left out, and hovering a point names the experiment.";

/**
 * Which columns carry the experiment, keyed by the chart's entity dimension.
 * A score's level decides this: an observation-level score reads the experiment
 * off its observation, a trace-level score off the scored trace's root event,
 * and a run-level score is keyed by dataset run id alone.
 */
const EXPERIMENT_SCOPE_COLUMNS: Record<
  string,
  { nameColumn?: string; idColumn: string }
> = {
  experimentName: { nameColumn: "experimentName", idColumn: "experimentId" },
  traceExperimentName: {
    nameColumn: "traceExperimentName",
    idColumn: "traceExperimentId",
  },
  datasetRunId: { idColumn: "datasetRunId" },
};

const buildExperimentScopeFilters = ({
  entityDimensionField,
  experimentNames,
  experimentIds,
}: {
  entityDimensionField?: string;
  experimentNames: string[];
  experimentIds: string[];
}) => {
  const scope = entityDimensionField
    ? EXPERIMENT_SCOPE_COLUMNS[entityDimensionField]
    : undefined;
  if (!scope) return [];

  return [
    ...(scope.nameColumn && experimentNames.length > 0
      ? [
          {
            column: scope.nameColumn,
            operator: "any of" as const,
            value: experimentNames,
            type: "stringOptions" as const,
          },
        ]
      : []),
    {
      column: scope.idColumn,
      operator: "any of" as const,
      value: experimentIds,
      type: "stringOptions" as const,
    },
  ];
};

type ExperimentMetricStripProps = {
  projectId: string;
  /** In table order — the strip's x-axis is that order. */
  experiments: Array<{ id: string; name: string }>;
  fromTimestamp: Date;
  toTimestamp: Date;
  isExternalLoading?: boolean;
};

/**
 * The compact metric strip above the experiments table — one chart in the band
 * the 4×224px chart grid used to occupy, modelled on the events table's
 * outlier strip. It plots one metric across the experiments in view, defaulting
 * to a score rather than cost, with the x-axis meaning "position in the table"
 * so a point maps back to a row without rendering long experiment names on the
 * axis. (LFE-15711)
 */
export function ExperimentMetricStrip({
  projectId,
  experiments,
  fromTimestamp,
  toTimestamp,
  isExternalLoading = false,
}: ExperimentMetricStripProps) {
  const experimentIds = useMemo(
    () => experiments.map((experiment) => experiment.id),
    [experiments],
  );

  const { metricId, setMetricId, availableMetricOptions, isLoading } =
    useExperimentStripMetric({ projectId, experimentIds });

  const { selectedMetricOption, widgetConfig } = useMemo(
    () => ({
      selectedMetricOption: availableMetricOptions.find(
        (option) => option.id === metricId,
      ),
      widgetConfig: buildWidgetConfigFromId(metricId),
    }),
    [availableMetricOptions, metricId],
  );

  // Presentation-only names for the entity axis; their insertion order is what
  // InlineWidget orders the x-axis by, so it carries the table's order too.
  const entityDimensionLabelMap = useMemo(
    () =>
      Object.fromEntries(
        experiments.map((experiment) => [experiment.id, experiment.name]),
      ),
    [experiments],
  );

  const query: QueryType | null = useMemo(() => {
    if (!widgetConfig) return null;

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
        ...buildExperimentScopeFilters({
          entityDimensionField,
          experimentNames,
          experimentIds,
        }),
      ],
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
    };
  }, [widgetConfig, experiments, experimentIds, fromTimestamp, toTimestamp]);

  const groupedOptions = useMemo(() => {
    const groups = new Map<MetricOption["group"], MetricOption[]>();

    for (const option of availableMetricOptions) {
      const existing = groups.get(option.group) ?? [];
      existing.push(option);
      groups.set(option.group, existing);
    }

    return groups;
  }, [availableMetricOptions]);

  // A stored metric can name a score the experiments in view don't carry; show
  // its name rather than a blank trigger.
  const selectedLabel =
    selectedMetricOption?.label ?? metricId.split(":").pop() ?? metricId;

  const isChartEnabled =
    Boolean(selectedMetricOption) && experiments.length > 0;
  const isStripLoading = isExternalLoading || isLoading;

  return (
    // Ruled top and bottom so the strip reads as its own band between the
    // toolbar and the table header.
    <div className="shrink-0 border-y px-3 pt-2 pb-1">
      <div className="flex items-baseline gap-1.5">
        <Select value={metricId} onValueChange={setMetricId}>
          <SelectTrigger
            aria-label={`Chart metric: ${selectedLabel}`}
            className="text-foreground hover:text-muted-foreground h-auto w-auto gap-0.5 border-0 bg-transparent p-0 text-[13px] leading-none font-bold shadow-none focus:ring-0 focus:ring-offset-0"
            hideDownIcon
          >
            <SelectValue placeholder="Select metric...">
              {selectedLabel}
            </SelectValue>
            <ChevronDown className="h-2.5 w-2.5" />
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
        <span className="text-muted-foreground flex items-baseline text-xs leading-none">
          in table order
          <DocPopup description={AXIS_EXPLANATION} />
        </span>
      </div>

      {/* 64px of canvas — the events table's outlier strip budget. */}
      <div className="mt-1.5 flex h-16 flex-col">
        {isStripLoading ? (
          <Skeleton className="h-full w-full" />
        ) : !isChartEnabled || !query || !widgetConfig ? (
          <NoDataOrLoading isLoading={false} className="h-full" />
        ) : (
          <WidgetContent
            projectId={projectId}
            query={query}
            version={widgetConfig.minVersion}
            chartType={widgetConfig.chartType}
            chartConfig={widgetConfig.chartConfig}
            metrics={[...widgetConfig.metrics]}
            dimensions={[...widgetConfig.dimensions]}
            view={widgetConfig.view}
            schedulerId={`experiments-strip-${metricId}`}
            isExternalLoading={isExternalLoading}
            layoutHint="tight"
            entityDimensionLabelMap={entityDimensionLabelMap}
            // Experiment names are far too long for a 64px band; the table
            // below carries identity (the axis is its order) and the tooltip
            // carries the exact name.
            hideXAxisLabels
          />
        )}
      </div>
    </div>
  );
}
