import { observationsTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";

const OBSERVATION_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  name: "name",
  type: "type",
  traceName: "traceName",
  level: "level",
  model: "model",
  modelId: "modelId",
  promptName: "promptName",
  tags: "tags",
  timeToFirstToken: "ttft",
  latency: "latency",
  tokensPerSecond: "tps",
  inputCost: "inputCost",
  outputCost: "outputCost",
  totalCost: "totalCost",
  inputTokens: "inputTokens",
  outputTokens: "outputTokens",
  totalTokens: "totalTokens",
};

export const observationFilterConfig: FilterConfig = {
  tableName: "observations",

  columnToQueryKey: OBSERVATION_COLUMN_TO_QUERY_KEY,

  columnDefinitions: observationsTableCols,

  defaultExpanded: ["type"],

  facets: [
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
      column: "model",
      label: "Model",
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
      column: "tags",
      label: "Trace Tags",
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
  ],
};
