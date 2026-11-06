import { type ColumnDefinition } from "@langfuse/shared";
import {
  AgentEnvironmentFilterListSchema,
  AgentListFilterListSchema,
} from "@langfuse/shared/agents";
import { type FilterConfig } from "@/src/features/filters/lib/filter-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

const environmentColumn: ColumnDefinition = {
  id: "environment",
  name: "Environment",
  type: "stringOptions",
  internal: "environment",
  options: [],
  aliases: ["env"],
};

export const agentEnvironmentFilterConfig: FilterConfig = {
  tableName: "agent-environment",
  columnDefinitions: [environmentColumn],
  defaultExpanded: ["environment"],
  facets: [
    { type: "categorical", column: "environment", label: "Environment" },
  ],
};

const numericColumns: ColumnDefinition[] = [
  {
    id: "runs",
    name: "Invocations",
    type: "number",
    internal: "runs",
    step: 1,
    min: 0,
  },
  {
    id: "traces",
    name: "Traces",
    type: "number",
    internal: "traces",
    step: 1,
    min: 0,
  },
  {
    id: "modelCalls",
    name: "Model calls",
    type: "number",
    internal: "modelCalls",
    step: 1,
    min: 0,
  },
  {
    id: "totalTokens",
    name: "Tokens",
    type: "number",
    internal: "totalTokens",
    step: 1,
    min: 0,
  },
  {
    id: "cost",
    name: "Model cost",
    type: "number",
    internal: "cost",
    step: 0.01,
    min: 0,
  },
  {
    id: "errorRuns",
    name: "Error invocations",
    type: "number",
    internal: "errorRuns",
    step: 1,
    min: 0,
  },
  {
    id: "averageRunDurationMs",
    name: "Average duration (ms)",
    type: "number",
    internal: "averageRunDurationMs",
    step: 1,
    min: 0,
  },
];

export const agentsFilterConfig: FilterConfig = {
  tableName: "agents",
  columnDefinitions: [
    environmentColumn,
    {
      id: "displayName",
      name: "Agent name",
      type: "string",
      internal: "displayName",
      aliases: ["name"],
    },
    { id: "id", name: "Agent ID", type: "string", internal: "id" },
    ...numericColumns,
  ],
  defaultExpanded: ["environment"],
  facets: [
    ...agentEnvironmentFilterConfig.facets,
    { type: "string", column: "displayName", label: "Agent name" },
    { type: "string", column: "id", label: "Agent ID" },
    {
      type: "numeric",
      column: "runs",
      label: "Invocations",
      min: 0,
      max: 10000,
      step: 1,
    },
    {
      type: "numeric",
      column: "traces",
      label: "Traces",
      min: 0,
      max: 10000,
      step: 1,
    },
    {
      type: "numeric",
      column: "modelCalls",
      label: "Model calls",
      min: 0,
      max: 100000,
      step: 1,
    },
    {
      type: "numeric",
      column: "totalTokens",
      label: "Tokens",
      min: 0,
      max: 1000000,
      step: 1,
    },
    {
      type: "numeric",
      column: "cost",
      label: "Model cost",
      min: 0,
      max: 100,
      step: 0.01,
      unit: "$",
    },
    {
      type: "numeric",
      column: "errorRuns",
      label: "Error invocations",
      min: 0,
      max: 10000,
      step: 1,
    },
    {
      type: "numeric",
      column: "averageRunDurationMs",
      label: "Average duration",
      min: 0,
      max: 300000,
      step: 1000,
      unit: "ms",
    },
  ],
};

export const AGENT_ENVIRONMENT_FIELD_REGISTRY = fieldRegistryFromColumns(
  agentEnvironmentFilterConfig.columnDefinitions,
  {
    id: "agent-environment",
    allowFreeText: false,
    defaultTextField: "environment",
    searchExamples: [
      "env:production",
      "env:(production OR staging)",
      "-env:dev",
    ],
    fields: { environment: { aliases: ["env"] } },
    filterStateErrors: (filters) => {
      const parsed = AgentEnvironmentFilterListSchema.safeParse(filters);
      return parsed.success ? [] : ["Choose supported environment filters."];
    },
  },
);

export const AGENTS_FIELD_REGISTRY = fieldRegistryFromColumns(
  agentsFilterConfig.columnDefinitions,
  {
    id: "agents",
    allowFreeText: true,
    freeTextScopeLabel: "agent names and IDs",
    defaultSearchType: ["id"],
    searchExamples: [
      "research",
      "env:production",
      "invocations:>10",
      "cost:>1",
    ],
    recentSearches: true,
    fields: {
      environment: { aliases: ["env"] },
      displayName: { aliases: ["name", "agent"] },
      id: { aliases: ["agentid", "agent_id"] },
      runs: { aliases: ["invocations"] },
      totalTokens: { aliases: ["tokens"] },
      cost: { unit: "$" },
      errorRuns: { aliases: ["errors"] },
      averageRunDurationMs: {
        aliases: ["durationMs"],
        description: "Average invocation duration in milliseconds",
        unit: "ms",
      },
    },
    filterStateErrors: (filters) => {
      const parsed = AgentListFilterListSchema.safeParse(filters);
      return parsed.success
        ? []
        : ["Choose supported agent filters (up to 20 conditions)."];
    },
  },
);
