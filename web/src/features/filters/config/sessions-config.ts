import { sessionsViewCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";

const SESSION_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  bookmarked: "bookmarked",
  id: "id",
  userIds: "userIds",
  sessionDuration: "duration",
  countTraces: "traces",
  inputCost: "inputCost",
  outputCost: "outputCost",
  totalCost: "totalCost",
  inputTokens: "inputTokens",
  outputTokens: "outputTokens",
  totalTokens: "totalTokens",
  usage: "usage",
  traceTags: "tags",
  environment: "env",
  "Scores (categorical)": "scoreCategories",
  "Scores (numeric)": "scoresNumeric",
};

export const sessionFilterConfig: FilterConfig = {
  tableName: "sessions",

  columnToQueryKey: SESSION_COLUMN_TO_QUERY_KEY,

  columnDefinitions: sessionsViewCols,

  defaultExpanded: ["bookmarked"],

  facets: [
    {
      type: "categorical" as const,
      column: "environment",
      label: "Environment",
    },
    {
      type: "string" as const,
      column: "id",
      label: "ID",
    },
    {
      type: "categorical" as const,
      column: "userIds",
      label: "User IDs",
    },
    {
      type: "categorical" as const,
      column: "traceTags",
      label: "Trace Tags",
    },
    {
      type: "boolean" as const,
      column: "bookmarked",
      label: "Bookmarked",
      trueLabel: "Bookmarked",
      falseLabel: "Not bookmarked",
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
      type: "numeric" as const,
      column: "usage",
      label: "Usage",
      min: 0,
      max: 1000000,
    },
    {
      type: "keyValue" as const,
      column: "Scores (categorical)",
      label: "Categorical Scores",
    },
    {
      type: "numericKeyValue" as const,
      column: "Scores (numeric)",
      label: "Numeric Scores",
    },
  ],
};
