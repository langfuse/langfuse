import { tracesTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";

const TRACE_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  id: "id",
  name: "name",
  userId: "userId",
  sessionId: "sessionId",
  version: "version",
  release: "release",
  tags: "tags",
  environment: "env",
  level: "level",
  bookmarked: "bookmarked",
  latency: "latency",
  inputTokens: "inputTokens",
  outputTokens: "outputTokens",
  totalTokens: "totalTokens",
  inputCost: "inputCost",
  outputCost: "outputCost",
  totalCost: "totalCost",
  "Scores (categorical)": "scoreCategories",
  "Scores (numeric)": "scoresNumeric",
  Metadata: "metadata",
};

export const traceFilterConfig: FilterConfig = {
  tableName: "traces",

  columnToQueryKey: TRACE_COLUMN_TO_QUERY_KEY,

  columnDefinitions: tracesTableCols,

  defaultExpanded: ["environment", "name"],

  facets: [
    {
      type: "categorical" as const,
      column: "environment",
      label: "Environment",
    },
    {
      type: "categorical" as const,
      column: "name",
      label: "Trace Name",
    },
    {
      type: "string" as const,
      column: "id",
      label: "Trace ID",
    },
    {
      type: "string" as const,
      column: "sessionId",
      label: "Session ID",
    },
    {
      type: "string" as const,
      column: "userId",
      label: "User ID",
    },
    {
      type: "stringKeyValue" as const,
      column: "Metadata",
      label: "Metadata",
    },
    {
      type: "string" as const,
      column: "version",
      label: "Version",
    },
    {
      type: "string" as const,
      column: "release",
      label: "Release",
    },
    {
      type: "boolean" as const,
      column: "bookmarked",
      label: "Bookmarked",
      trueLabel: "Bookmarked",
      falseLabel: "Not bookmarked",
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Tags",
    },
    {
      type: "categorical" as const,
      column: "level",
      label: "Level",
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
