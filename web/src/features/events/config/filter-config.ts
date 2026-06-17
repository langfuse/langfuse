import { eventsTableCols, type FilterState } from "@langfuse/shared";
import {
  omitFilterFacets,
  type FilterConfig,
} from "@/src/features/filters/lib/filter-config";
import type { ColumnToBackendKeyMap } from "@/src/features/filters/lib/filter-transform";
import { renderFilterIcon } from "@/src/components/ItemBadge";

// Helper function to get column name from eventsTableCols by ID
export const getEventsColumnName = (id: string): string => {
  const column = eventsTableCols.find((col) => col.id === id);
  if (!column) {
    throw new Error(`Column ${id} not found in eventsTableCols`);
  }
  return column.name;
};

/**
 * Maps frontend column IDs to backend-expected column IDs for events table
 * Events table uses different naming conventions than observations table
 */
export const OBSERVATION_EVENTS_COLUMN_TO_BACKEND_KEY: ColumnToBackendKeyMap = {
  // No mapping needed currently - events table column names align with UI
};

const isBooleanEqualityOperator = (operator: string): operator is "=" | "<>" =>
  operator === "=" || operator === "<>";

export const migrateLegacyRootObservationFilters = (
  filters: FilterState,
): FilterState => {
  const hasRootObservationFilter = filters.some(
    (filter) =>
      filter.column === "isRootObservation" &&
      filter.type === "boolean" &&
      isBooleanEqualityOperator(filter.operator),
  );

  return filters.flatMap((filter) => {
    if (
      filter.column === "isRootObservation" &&
      filter.type === "boolean" &&
      isBooleanEqualityOperator(filter.operator)
    ) {
      return [
        {
          ...filter,
          operator: "=" as const,
          value: filter.operator === "<>" ? !filter.value : filter.value,
        },
      ];
    }

    if (
      (filter.column === "hasParentObservation" ||
        filter.column === "Has Parent Observation") &&
      filter.type === "boolean" &&
      isBooleanEqualityOperator(filter.operator)
    ) {
      if (hasRootObservationFilter) {
        return [];
      }

      return [
        {
          ...filter,
          column: "isRootObservation",
          operator: "=" as const,
          value: filter.operator === "=" ? !filter.value : filter.value,
        },
      ];
    }

    return [filter];
  });
};

export type ObservationEventsOmittableFilterColumn = "sessionId" | "userId";

export const observationEventsFilterConfig: FilterConfig = {
  tableName: "observations-events",

  columnDefinitions: eventsTableCols,

  defaultExpanded: ["environment", "name", "isRootObservation", "type"],

  migrateFilterState: migrateLegacyRootObservationFilters,

  facets: [
    {
      type: "categorical" as const,
      column: "environment",
      label: getEventsColumnName("environment"),
    },
    {
      type: "categorical" as const,
      column: "type",
      label: getEventsColumnName("type"),
      help: {
        description:
          "Observation types classify the work captured within a trace, such as generations, spans, tools, chains, and agents.",
        href: "https://langfuse.com/docs/observability/features/observation-types",
      },
      renderIcon: renderFilterIcon,
    },
    {
      type: "boolean" as const,
      column: "isRootObservation",
      label: "Is Root Observation",
      tooltip:
        "A root observation is top-level in a trace or marked as an app root by the SDK. Filter to 'True' to see root-level observations.",
    },
    {
      type: "categorical" as const,
      column: "traceName",
      label: getEventsColumnName("traceName"),
    },
    {
      type: "categorical" as const,
      column: "name",
      label: getEventsColumnName("name"),
    },
    {
      type: "categorical" as const,
      column: "level",
      label: getEventsColumnName("level"),
    },
    {
      type: "categorical" as const,
      column: "providedModelName",
      label: getEventsColumnName("providedModelName"),
    },
    {
      type: "categorical" as const,
      column: "modelId",
      label: getEventsColumnName("modelId"),
    },
    {
      type: "categorical" as const,
      column: "promptName",
      label: getEventsColumnName("promptName"),
    },
    {
      type: "categorical" as const,
      column: "traceTags",
      label: getEventsColumnName("traceTags"),
    },
    {
      type: "stringKeyValue" as const,
      column: "metadata",
      label: getEventsColumnName("metadata"),
    },
    {
      type: "categorical" as const,
      column: "version",
      label: getEventsColumnName("version"),
    },
    {
      type: "string" as const,
      column: "statusMessage",
      label: getEventsColumnName("statusMessage"),
    },
    {
      type: "string" as const,
      column: "traceId",
      label: getEventsColumnName("traceId"),
    },
    {
      type: "categorical" as const,
      column: "sessionId",
      label: getEventsColumnName("sessionId"),
    },
    {
      type: "categorical" as const,
      column: "userId",
      label: getEventsColumnName("userId"),
    },
    {
      type: "categorical" as const,
      column: "experimentDatasetId",
      label: getEventsColumnName("experimentDatasetId"),
    },
    {
      type: "categorical" as const,
      column: "experimentId",
      label: getEventsColumnName("experimentId"),
    },
    {
      type: "categorical" as const,
      column: "experimentName",
      label: getEventsColumnName("experimentName"),
    },
    {
      type: "numeric" as const,
      column: "latency",
      label: getEventsColumnName("latency"),
      min: 0,
      max: 60,
      unit: "s",
    },
    {
      type: "numeric" as const,
      column: "timeToFirstToken",
      label: getEventsColumnName("timeToFirstToken"),
      min: 0,
      max: 60,
      unit: "s",
    },
    {
      type: "numeric" as const,
      column: "inputTokens",
      label: getEventsColumnName("inputTokens"),
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "outputTokens",
      label: getEventsColumnName("outputTokens"),
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "totalTokens",
      label: getEventsColumnName("totalTokens"),
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "inputCost",
      label: getEventsColumnName("inputCost"),
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "numeric" as const,
      column: "outputCost",
      label: getEventsColumnName("outputCost"),
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "numeric" as const,
      column: "totalCost",
      label: getEventsColumnName("totalCost"),
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "categorical" as const,
      column: "toolNames",
      label: "Tool Names (Available)",
    },
    {
      type: "categorical" as const,
      column: "calledToolNames",
      label: "Tool Names (Called)",
    },
    {
      type: "numeric" as const,
      column: "toolDefinitions",
      label: "Available Tools",
      min: 0,
      max: 25,
    },
    {
      type: "numeric" as const,
      column: "toolCalls",
      label: "Tool Calls",
      min: 0,
      max: 25,
    },
    {
      type: "keyValue" as const,
      column: "score_categories",
      label: "Categorical Scores",
    },
    {
      type: "numericKeyValue" as const,
      column: "scores_avg",
      label: "Numeric Scores",
    },
    {
      type: "keyValue" as const,
      column: "trace_score_categories",
      label: "Trace Categorical Scores",
    },
    {
      type: "numericKeyValue" as const,
      column: "trace_scores_avg",
      label: "Trace Numeric Scores",
    },
    {
      type: "numeric" as const,
      column: "commentCount",
      label: "Comment Count",
      min: 0,
      max: 100,
    },
    {
      type: "string" as const,
      column: "commentContent",
      label: "Comment Content",
    },
  ],
};

export function getObservationEventsFilterConfig(
  omittedFilter: ObservationEventsOmittableFilterColumn[] = [],
): FilterConfig {
  return omitFilterFacets(observationEventsFilterConfig, omittedFilter);
}
