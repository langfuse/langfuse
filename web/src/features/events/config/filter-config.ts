import { eventsTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";
import type { ColumnToBackendKeyMap } from "@/src/features/filters/lib/filter-transform";

// Helper function to get column name from eventsTableCols by ID
export const getEventsColumnName = (id: string): string => {
  const column = eventsTableCols.find((col) => col.id === id);
  if (!column) {
    throw new Error(`Column ${id} not found in eventsTableCols`);
  }
  return column?.name;
};

const OBSERVATION_EVENTS_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  environment: "environment",
  name: "name",
  type: "type",
  traceName: "traceName",
  level: "level",
  providedModelName: "providedModelName",
  modelId: "modelId",
  promptName: "promptName",
  traceTags: "traceTags",
  metadata: "metadata",
  version: "version",
  timeToFirstToken: "timeToFirstToken",
  latency: "latency",
  tokensPerSecond: "tokensPerSecond",
  inputCost: "inputCost",
  outputCost: "outputCost",
  totalCost: "totalCost",
  inputTokens: "inputTokens",
  outputTokens: "outputTokens",
  totalTokens: "totalTokens",
  score_categories: "score_categories",
  scores_avg: "scores_avg",
  spanId: "spanId",
  parentSpanId: "parentSpanId",
  traceId: "traceId",
  userId: "userId",
  sessionId: "sessionId",
  statusMessage: "statusMessage",
  completionStartTime: "completionStartTime",
  promptId: "promptId",
  promptVersion: "promptVersion",
};

/**
 * Maps frontend column IDs to backend-expected column IDs for events table
 * Events table uses different naming conventions than observations table
 */
export const OBSERVATION_EVENTS_COLUMN_TO_BACKEND_KEY: ColumnToBackendKeyMap = {
  // No mapping needed currently - events table column names align with UI
};

export const observationEventsFilterConfig: FilterConfig = {
  tableName: "observations-events",

  columnToQueryKey: OBSERVATION_EVENTS_COLUMN_TO_QUERY_KEY,

  columnDefinitions: eventsTableCols,

  defaultExpanded: ["environment", "name"],

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
      type: "categorical" as const,
      column: "userId",
      label: getEventsColumnName("userId"),
    },
    {
      type: "categorical" as const,
      column: "sessionId",
      label: getEventsColumnName("sessionId"),
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
      type: "keyValue" as const,
      column: "score_categories",
      label: "Categorical Scores",
    },
    {
      type: "numericKeyValue" as const,
      column: "scores_avg",
      label: "Numeric Scores",
    },
  ],
};
