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
import { ScoreTag, SCORE_LEVEL_LABELS } from "@/src/components/score-tag";
import { WidgetContent } from "@/src/features/widgets/components/InlineWidget";
import { type QueryType } from "@langfuse/shared/query";
import type {
  MetricOption,
  ScoreCoverageByLevel,
} from "@/src/features/experiments/types/charts";
import { buildWidgetConfigFromId } from "@/src/features/experiments/utils/charts";
import { SCORE_LEVEL_TAGS } from "@/src/features/experiments/constants/charts";
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
 * being squeezed to make room.
 */
const PLOT_WITH_LEGEND_HEIGHT_CLASS = "h-[83px]";

/**
 * What this strip's ready content occupies, for the band's loading and empty
 * box: the 13px header row (a `leading-none` 13px trigger), the 6px gap under
 * it, and the plot with its legend. Taller than the band's default, and a
 * placeholder of the wrong height drops the table by the difference the moment
 * the data arrives.
 */
const CONTENT_HEIGHT_CLASS = "h-[102px]";

const AXIS_EXPLANATION =
  "One bar per experiment in view, oldest on the left and newest on the right, so a metric that improved over time climbs. The bars are a set of runs in start order, not a timeline — nothing is implied between two of them. The table below stays newest-first; filtering it changes which experiments are plotted, not their left-to-right order. Experiments with no value for this metric are left out. The legend below names each bar; past eight experiments the chart palette would give two bars the same colour, so the bars go one colour and hovering one names it. Which metric opens by default is data-driven: the numeric score recorded on the most items across these experiments, with ties settled by name, falling back to cost only when none of them carry a score. Pick any metric from the dropdown and that choice is kept instead.";

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
  traceExperimentId: { idColumn: "traceExperimentId" },
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
  /**
   * Values recorded per score name across the experiments in view, from the
   * table's own rows. Decides the default metric (`pickDefaultStripMetric`);
   * undefined until the row metrics land.
   */
  scoreCoverage?: ScoreCoverageByLevel;
};

/**
 * The compact metric strip above the experiments table — one chart in the band
 * the 4×224px chart grid used to occupy, modelled on the events table's
 * outlier strip. It plots one metric across the experiments in view, defaulting
 * to the best-recorded numeric score rather than cost, as one bar per
 * experiment on a chronological
 * x-axis (oldest left) so an improving metric climbs. The axis is a set of
 * discrete runs, not a timeline — hence bars, not a line. Long experiment names
 * stay off the axis; the legend and the hover tooltip carry identity.
 */
export function ExperimentMetricStrip({
  projectId,
  experiments,
  fromTimestamp,
  toTimestamp,
  isExternalLoading = false,
  scoreCoverage,
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
    useExperimentStripMetric({ projectId, experimentIds, scoreCoverage });

  const handleMetricChange = (newMetricId: string) => {
    if (newMetricId === metricId) return;
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

  // Every dropdown row is tagged with its level; the header only needs the tag
  // when the name alone doesn't say which series is drawn — the same score name
  // can exist at two levels and the chart plots exactly one of them. A
  // selected name that is unique reads plain, as in the tracing tables'
  // filter picker.
  const selectedLevel = selectedMetricOption?.level;
  const isSelectedNameAmbiguous =
    Boolean(selectedLevel) &&
    availableMetricOptions.filter(
      (option) => option.label === selectedMetricOption?.label,
    ).length > 1;

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
      contentHeightClass={CONTENT_HEIGHT_CLASS}
      // The band's own voice, in place of a 144px dashed card clipped by a
      // 63px band: say which half is missing.
      emptyMessage="No experiments in view"
      header={
        <MetricStripHeaderRow>
          <Select value={metricId} onValueChange={handleMetricChange}>
            <SelectTrigger
              aria-label={
                selectedLevel
                  ? `Chart metric: ${selectedLabel} (${SCORE_LEVEL_LABELS[SCORE_LEVEL_TAGS[selectedLevel]]})`
                  : `Chart metric: ${selectedLabel}`
              }
              // The band's own bold trigger (`MetricStripTrigger`), on a
              // Select rather than a DropdownMenu: this list is long (every
              // score name, at every level), so it needs the scrolling and
              // type-to-find a Select brings.
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
              {isSelectedNameAmbiguous && selectedLevel && (
                <ScoreTag level={SCORE_LEVEL_TAGS[selectedLevel]} />
              )}
              <ChevronDown className="h-2.5 w-2.5" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(groupedOptions.entries()).map(([group, options]) => (
                <SelectGroup key={group}>
                  <SelectLabel className="text-xs font-bold">
                    {group}
                  </SelectLabel>
                  {options.map((option) => (
                    <SelectItem
                      key={option.id}
                      value={option.id}
                      // Type-to-find stays on the score name, so the level tag
                      // can't swallow a keystroke.
                      textValue={option.label}
                    >
                      <span className="flex items-center gap-1.5">
                        {option.label}
                        {option.level && (
                          <ScoreTag level={SCORE_LEVEL_TAGS[option.level]} />
                        )}
                      </span>
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
            // Bars are compared by length, so they have to start at zero.
            zeroBaseline
          />
        )}
      </div>
    </MetricStripBand>
  );
}
