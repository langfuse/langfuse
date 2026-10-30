import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type ColumnDefinition,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";
import {
  TOPICS_RULE_FILTER_COLUMNS,
  type TopicTimeRange,
} from "@langfuse/shared/topics";
import { toObservedOptions } from "@/src/features/search-bar";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";

/**
 * Which fields a Topics filter offers: rules match spans as they arrive, so only
 * span fields known at ingestion; one-off runs also take scores, latency and cost.
 */
type TopicFilterScope = "rule" | "process" | "analysis";

const analysisColumns: ColumnDefinition[] = [
  { name: "Latency (s)", id: "latency", type: "number", internal: "latency" },
  {
    name: "Total cost ($)",
    id: "totalCost",
    type: "number",
    internal: "totalCost",
  },
  {
    name: "Trace scores (numeric)",
    id: "trace_scores_avg",
    type: "numberObject",
    internal: "trace_scores_avg",
  },
  {
    name: "Observation scores (numeric)",
    id: "scores_avg",
    type: "numberObject",
    internal: "scores_avg",
  },
];

export function useTopicFilterColumns({
  projectId,
  filter,
  range,
  scope,
  enabled,
  lazy = false,
}: {
  projectId: string;
  filter: FilterState;
  range: TopicTimeRange;
  scope: TopicFilterScope;
  enabled: boolean;
  lazy?: boolean;
}) {
  const startTimeFilter: TimeFilter[] = [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: range.from,
    },
    { column: "startTime", type: "datetime", operator: "<", value: range.to },
  ];
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter: filter.map((item) =>
      item.column === "tags" ? { ...item, column: "traceTags" } : item,
    ),
    lazy,
    columns: [
      "environment",
      "name",
      "traceTags",
      "traceName",
      "calledToolNames",
      "experimentDatasetId",
      "experimentId",
    ],
    enabled,
  });
  const observed = toObservedOptions(
    options.filterOptions,
    options.isFilterOptionsPending,
  );
  const columns = experimentEvalFilterColsWithOptions(
    options.filterOptions,
    observationEvalFilterColsWithOptions(
      { ...options.filterOptions, tags: options.filterOptions?.traceTags },
      [...eventsEvalFilterColumns],
    ),
  ).flatMap((column) => {
    if (column.id === "isRootObservation") return [];
    return column.id === "experimentId" && column.type === "stringOptions"
      ? [{ ...column, options: options.filterOptions?.experimentId ?? [] }]
      : [column];
  });
  const builderColumns =
    scope === "rule"
      ? columns.filter((column) =>
          (TOPICS_RULE_FILTER_COLUMNS as readonly string[]).includes(column.id),
        )
      : [...columns, ...analysisColumns];
  return { builderColumns, observed, options };
}
