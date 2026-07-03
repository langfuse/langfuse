import {
  SystemTableViewPresetCategory,
  type TableViewPresetState,
  TableViewPresetTableName,
} from "../../../domain/table-view-presets";

export const SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX = "__langfuse_";

export const isSystemTableViewPresetId = (
  id: string | undefined | null,
): boolean => !!id?.startsWith(SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX);

export interface SystemTableViewPreset {
  id: string;
  name: string;
  description?: string;
  tableName: TableViewPresetTableName;
  /**
   * When set, the preset is surfaced as a quick-access chip beneath the search
   * bar, grouped under this category. Uncategorized presets appear only in the
   * views drawer.
   */
  category?: SystemTableViewPresetCategory;
  state: TableViewPresetState;
}

const buildSystemPreset = ({
  id,
  name,
  description,
  tableName,
  category,
  filters,
  orderBy = null,
}: {
  id: string;
  name: string;
  description?: string;
  tableName: TableViewPresetTableName;
  category?: SystemTableViewPresetCategory;
  filters: TableViewPresetState["filters"];
  orderBy?: TableViewPresetState["orderBy"];
}): SystemTableViewPreset => ({
  id,
  name,
  description,
  tableName,
  category,
  state: {
    filters,
    columnOrder: [],
    columnVisibility: {},
    orderBy,
    searchQuery: "",
  },
});

const buildFilterOnlySystemPreset = (args: {
  id: string;
  name: string;
  description?: string;
  tableName: TableViewPresetTableName;
  filters: TableViewPresetState["filters"];
}): SystemTableViewPreset => buildSystemPreset(args);

const OBSERVATIONS_EVENTS_SYSTEM_TABLE_VIEW_PRESETS: SystemTableViewPreset[] = [
  buildFilterOnlySystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}trace_root_observations`,
    name: "Root Observations",
    description:
      "See top-level observations only, good for trace-level analysis",
    tableName: TableViewPresetTableName.ObservationsEvents,
    filters: [
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ],
  }),
  buildFilterOnlySystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}generations_only`,
    name: "Generations Only",
    description: "Focus on LLM generation observations",
    tableName: TableViewPresetTableName.ObservationsEvents,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ],
  }),
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}errors_only`,
    name: "Errors Only",
    description: "Focus on observations that failed",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.Errors,
    filters: [
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
    ],
  }),
  buildFilterOnlySystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}agent_workflow`,
    name: "Agent Workflow",
    description: "Follow agent steps, tool calls, and retrievals",
    tableName: TableViewPresetTableName.ObservationsEvents,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["AGENT", "CHAIN", "TOOL", "RETRIEVER"],
      },
    ],
  }),

  // --- Slow calls -----------------------------------------------------------
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}slowest_calls`,
    name: "Slowest calls",
    description: "Highest latency observations first",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.SlowCalls,
    filters: [],
    orderBy: { column: "latency", order: "DESC" },
  }),
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}latency_over_10s`,
    name: "Latency over 10s",
    description: "Observations taking longer than 10 seconds",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.SlowCalls,
    filters: [
      { column: "latency", type: "number", operator: ">", value: 10 },
    ],
    orderBy: { column: "latency", order: "DESC" },
  }),
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}slow_generations`,
    name: "Slow generations",
    description: "Generation calls slower than 5 seconds",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.SlowCalls,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      { column: "latency", type: "number", operator: ">", value: 5 },
    ],
    orderBy: { column: "latency", order: "DESC" },
  }),
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}slow_to_first_token`,
    name: "Slow to first token",
    description: "High time-to-first-token for streamed generations",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.SlowCalls,
    filters: [
      {
        column: "timeToFirstToken",
        type: "number",
        operator: ">",
        value: 2,
      },
    ],
  }),

  // --- Errors ---------------------------------------------------------------
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}warnings_and_errors`,
    name: "Warnings & errors",
    description: "Observations logged at WARNING or ERROR level",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.Errors,
    filters: [
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR", "WARNING"],
      },
    ],
  }),
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}errors_with_message`,
    name: "Errors with a message",
    description: "Failed observations that carry a status message",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.Errors,
    filters: [
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
      {
        column: "statusMessage",
        type: "null",
        operator: "is not null",
        value: "",
      },
    ],
  }),

  // --- Cost regression ------------------------------------------------------
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}most_expensive`,
    name: "Most expensive",
    description: "Highest total cost observations first",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.CostRegression,
    filters: [],
    orderBy: { column: "totalCost", order: "DESC" },
  }),
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}high_cost`,
    name: "High cost (> $1)",
    description: "Observations costing more than $1",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.CostRegression,
    filters: [
      { column: "totalCost", type: "number", operator: ">", value: 1 },
    ],
    orderBy: { column: "totalCost", order: "DESC" },
  }),
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}high_token_usage`,
    name: "High token usage",
    description: "Observations using more than 50k tokens",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.CostRegression,
    filters: [
      {
        column: "totalTokens",
        type: "number",
        operator: ">",
        value: 50000,
      },
    ],
  }),
];

const SYSTEM_TABLE_VIEW_PRESETS: Partial<
  Record<TableViewPresetTableName, SystemTableViewPreset[]>
> = {
  [TableViewPresetTableName.ObservationsEvents]:
    OBSERVATIONS_EVENTS_SYSTEM_TABLE_VIEW_PRESETS,
};

export const getSystemTableViewPresets = (
  tableName: TableViewPresetTableName,
) => SYSTEM_TABLE_VIEW_PRESETS[tableName] ?? [];

export const getSystemTableViewPresetByTableAndId = (
  tableName: TableViewPresetTableName,
  id: string,
): SystemTableViewPreset | null =>
  getSystemTableViewPresets(tableName).find((preset) => preset.id === id) ??
  null;

export const getSystemTableViewPresetById = (
  id: string,
): SystemTableViewPreset | null => {
  for (const presets of Object.values(SYSTEM_TABLE_VIEW_PRESETS)) {
    const preset = presets?.find((candidate) => candidate.id === id);
    if (preset) return preset;
  }

  return null;
};
