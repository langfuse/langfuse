import { eventsTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";
import type { ColumnToBackendKeyMap } from "@/src/features/filters/lib/filter-transform";

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
  source: "source",
  serviceName: "serviceName",
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
      label: "Environment",
    },
    {
      type: "categorical" as const,
      column: "type",
      label: "Type",
    },
    {
      type: "categorical" as const,
      column: "name",
      label: "Name",
    },
    {
      type: "categorical" as const,
      column: "traceName",
      label: "Trace Name",
    },
    {
      type: "categorical" as const,
      column: "level",
      label: "Level",
    },
    {
      type: "categorical" as const,
      column: "providedModelName",
      label: "Provided Model Name",
    },
    {
      type: "categorical" as const,
      column: "modelId",
      label: "Model ID",
    },
    {
      type: "categorical" as const,
      column: "promptName",
      label: "Prompt Name",
    },
    {
      type: "categorical" as const,
      column: "traceTags",
      label: "Trace Tags",
    },
    {
      type: "stringKeyValue" as const,
      column: "metadata",
      label: "Metadata",
    },
    {
      type: "string" as const,
      column: "version",
      label: "Version",
    },
    {
      type: "string" as const,
      column: "statusMessage",
      label: "Status Message",
    },
    {
      type: "string" as const,
      column: "userId",
      label: "User ID",
    },
    {
      type: "string" as const,
      column: "sessionId",
      label: "Session ID",
    },
    {
      type: "string" as const,
      column: "source",
      label: "Source",
    },
    {
      type: "string" as const,
      column: "serviceName",
      label: "Service Name",
    },
    {
      type: "numeric" as const,
      column: "latency",
      label: "Latency",
      min: 0,
      max: 60,
      unit: "s",
    },
    {
      type: "numeric" as const,
      column: "timeToFirstToken",
      label: "Time to First Token",
      min: 0,
      max: 60,
      unit: "s",
    },
    {
      type: "numeric" as const,
      column: "inputTokens",
      label: "Input Tokens",
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "outputTokens",
      label: "Output Tokens",
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "totalTokens",
      label: "Total Tokens",
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "inputCost",
      label: "Input Cost",
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "numeric" as const,
      column: "outputCost",
      label: "Output Cost",
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "numeric" as const,
      column: "totalCost",
      label: "Total Cost",
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
