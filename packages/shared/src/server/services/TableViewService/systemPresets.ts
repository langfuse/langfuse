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

const OBSERVATIONS_EVENTS_SYSTEM_TABLE_VIEW_PRESETS: SystemTableViewPreset[] = [
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

  // --- Slow calls -----------------------------------------------------------
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}latency_over_10s`,
    name: "Latency over 10s",
    description: "Observations taking longer than 10 seconds",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.SlowCalls,
    filters: [{ column: "latency", type: "number", operator: ">", value: 10 }],
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
    // Shipped-id stability: this is the pre-chips "Generations Only" preset
    // (identical filters) renamed and categorized. Its id already lives in
    // bookmarked `?viewId=` URLs and `default_views` rows (view_id has no FK
    // on purpose), so the rename keeps the id — retiring it would strand
    // those references. Never mint a new id for a preset whose meaning
    // survives a catalog iteration — and conversely, the FILTER SEMANTICS
    // under this id are frozen: tightening this preset (e.g. adding score or
    // output filters) would silently morph every old bookmark/default, so a
    // preset with a different meaning must get a new id.
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}generations_only`,
    name: "Review output (generations)",
    description: "LLM generation outputs, for reviewing response quality",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.Errors,
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
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}missed_tool_calls`,
    name: "Missed tool calls",
    description: "LLM calls that had tools available but didn't call any",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.Errors,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
      { column: "toolDefinitions", type: "number", operator: ">", value: 0 },
      { column: "toolCalls", type: "number", operator: "=", value: 0 },
    ],
  }),

  // --- Cost regression ------------------------------------------------------
  buildSystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}high_cost`,
    name: "High cost (> $1)",
    description: "Observations costing more than $1",
    tableName: TableViewPresetTableName.ObservationsEvents,
    category: SystemTableViewPresetCategory.CostRegression,
    filters: [{ column: "totalCost", type: "number", operator: ">", value: 1 }],
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
    orderBy: { column: "totalTokens", order: "DESC" },
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
