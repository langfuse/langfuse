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
import { buildWidgetConfigFromId } from "@/src/features/experiments/utils/charts";
import { cn } from "@/src/utils/tailwind";
import {
  MetricStripBand,
  MetricStripHeaderRow,
  MetricStripMessage,
  type MetricStripStatus,
} from "@/src/components/metric-strip/MetricStripBand";
import {
  METRIC_STRIP_TRIGGER_CLASS,
  metricStripTriggerClasses,
} from "@/src/components/metric-strip/MetricStripTrigger";
import { useExperimentStripMetric } from "@/src/features/experiments/hooks/useExperimentStripMetric";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { chartMetricChangedProps } from "@/src/features/experiments/lib/analytics";

/**
 * Stable node: `Chart` is memoized, so a fresh element on every render would
 * defeat it. Says which half is missing — the metric, not the experiments.
 */
const EMPTY_PLOT = <MetricStripMessage message="No values for this metric" />;

/**
 * The band's shared plot height plus one 20px row for the bar legend beneath
 * it. Constant, because the chart always draws exactly one row there — the
 * per-experiment legend, or the "hover a bar" note when there are more
 * experiments than the palette can tell apart — so the plot itself stays the
 * band's 63px and still lines up with the events and scores strips instead of
 * being squeezed to make room. (LFE-15711)
 */
const PLOT_WITH_LEGEND_HEIGHT_CLASS = "h-[83px]";

const AXIS_EXPLANATION =
  "One bar per experiment in view, oldest on the left and newest on the right, so a metric that improved over time climbs. The bars are a set of runs in start order, not a timeline — nothing is implied between two of them. The table below stays newest-first; filtering it changes which experiments are plotted, not their left-to-right order. Experiments with no value for this metric are left out. The legend below names each bar; past eight experiments the chart palette would give two bars the same colour, so the bars go one colour and hovering one names it.";

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
  /** The experiments in view, in any order; the strip re-orders by start time. */
  experiments: Array<{ id: string; name: string; startTime: Date }>;
  fromTimestamp: Date;
  toTimestamp: Date;
  isExternalLoading?: boolean;
};

/**
 * The compact metric strip above the experiments table — one chart in the band
 * the 4×224px chart grid used to occupy, modelled on the events table's
 * outlier strip. It plots one metric across the experiments in view, defaulting
 * to a score rather than cost, as one bar per experiment on a chronological
 * x-axis (oldest left) so an improving metric climbs. The axis is a set of
 * discrete runs, not a timeline — hence bars, not a line. Long experiment names
 * stay off the axis; the legend and the hover tooltip carry identity.
 * (LFE-15711)
 */
export function ExperimentMetricStrip({
  projectId,
  experiments,
  fromTimestamp,
  toTimestamp,
  isExternalLoading = false,
}: ExperimentMetricStripProps) {
  // Chronological, oldest first: an improving metric has to read left-to-right.
  // The table stays newest-first, so this is deliberately not the table order.
  const orderedExperiments = useMemo(
    () =>
      [...experiments].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      ),
    [experiments],
  );

  const experimentIds = useMemo(
    () => orderedExperiments.map((experiment) => experiment.id),
    [orderedExperiments],
  );

  const { metricId, setMetricId, availableMetricOptions, isLoading } =
    useExperimentStripMetric({ projectId, experimentIds });
  const capture = usePostHogClientCapture();

  // Do people move the strip off its score-first default, and onto which score
  // LEVEL? Trace-level is where an LLM-as-judge on a dataset run writes, so the
  // level is the interesting half. The score's NAME is user content and is
  // never sent. Reuses `chart_metric_changed` from the chart grid this strip
  // replaced, so the metric-choice history is continuous. (LFE-15720)
  const handleMetricChange = (newMetricId: string) => {
    if (newMetricId === metricId) return;
    capture(
      "experiment:chart_metric_changed",
      chartMetricChangedProps({
        tableName: "experiments",
        metricId: newMetricId,
      }),
    );
    setMetricId(newMetricId);
  };

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
  // InlineWidget orders the x-axis by, so it carries the chronological order.
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

  const query: QueryType | null = useMemo(() => {
    if (!widgetConfig) return null;

    const experimentNames = Array.from(
      new Set(
        orderedExperiments
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
  }, [
    widgetConfig,
    orderedExperiments,
    experimentIds,
    fromTimestamp,
    toTimestamp,
  ]);

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
    Boolean(selectedMetricOption) && orderedExperiments.length > 0;
  const status: MetricStripStatus =
    isExternalLoading || isLoading
      ? "loading"
      : isChartEnabled
        ? "ready"
        : "empty";

  return (
    <MetricStripBand
      status={status}
      // The band's own voice, in place of a 144px dashed card clipped by a
      // 63px band: say which half is missing.
      emptyMessage="No experiments in view"
      header={
        <MetricStripHeaderRow>
          <Select value={metricId} onValueChange={handleMetricChange}>
            <SelectTrigger
              aria-label={`Chart metric: ${selectedLabel}`}
              // The band's own bold trigger (`MetricStripTrigger`), on a
              // Select rather than a DropdownMenu: this list is grouped and
              // long (every score name, at three levels), so it needs the
              // scrolling and type-to-find a Select brings.
              className={cn(
                METRIC_STRIP_TRIGGER_CLASS,
                metricStripTriggerClasses.metric,
                "h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0",
              )}
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
                  <SelectLabel className="text-xs font-bold">
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
          <span className="text-muted-foreground flex items-baseline text-xs leading-none">
            oldest to newest
            <DocPopup description={AXIS_EXPLANATION} />
          </span>
        </MetricStripHeaderRow>
      }
    >
      <div
        className={cn("mt-1.5 flex flex-col", PLOT_WITH_LEGEND_HEIGHT_CLASS)}
      >
        {query && widgetConfig && (
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
            // The band is 63px: the chart's own "No data" card is taller than
            // that and clips its own text inside it.
            emptyState={EMPTY_PLOT}
            // Experiment names are far too long for the axis of a 63px band
            // (angled category labels cost ~60px of it). Identity moves to the
            // legend below the plot, which fits in the space the events strip
            // spends on tick labels, so the band's height is unchanged; the
            // tooltip carries the exact name either way.
            hideXAxisLabels
            colorBarsByCategory
          />
        )}
      </div>
    </MetricStripBand>
  );
}
