import { sessionsViewCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";
import type { ColumnToBackendKeyMap } from "@/src/features/filters/lib/filter-transform";

const SESSION_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  bookmarked: "bookmarked",
  environment: "environment",
  userIds: "userIds",
  tags: "tags",
  sessionDuration: "sessionDuration",
  countTraces: "countTraces",
  inputCost: "inputCost",
  outputCost: "outputCost",
  totalCost: "totalCost",
  inputTokens: "inputTokens",
  outputTokens: "outputTokens",
  totalTokens: "totalTokens",
  score_categories: "score_categories",
  scores_avg: "scores_avg",
};

/**
 * Maps frontend column IDs to backend-expected column IDs
 * Frontend uses "tags" but backend CH mapping expects "traceTags" for trace tags on sessions table
 */
export const SESSION_COLUMN_TO_BACKEND_KEY: ColumnToBackendKeyMap = {
  tags: "traceTags",
};

export const sessionFilterConfig: FilterConfig = {
  tableName: "sessions",

  columnToQueryKey: SESSION_COLUMN_TO_QUERY_KEY,

  columnDefinitions: sessionsViewCols,

  defaultExpanded: ["environment", "bookmarked"],

  facets: [
    {
      type: "boolean" as const,
      column: "bookmarked",
      label: "Bookmarked",
      trueLabel: "Bookmarked",
      falseLabel: "Not bookmarked",
    },
    {
      type: "categorical" as const,
      column: "environment",
      label: "Environment",
    },
    {
      type: "categorical" as const,
      column: "userIds",
      label: "User IDs",
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Trace Tags",
    },
    {
      type: "numeric" as const,
      column: "sessionDuration",
      label: "Session Duration",
      min: 0,
      max: 3600,
      unit: "s",
    },
    {
      type: "numeric" as const,
      column: "countTraces",
      label: "Traces Count",
      min: 0,
      max: 1000,
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
