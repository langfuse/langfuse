import {
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
  state: TableViewPresetState;
}

const buildFilterOnlySystemPreset = ({
  id,
  name,
  description,
  tableName,
  filters,
}: {
  id: string;
  name: string;
  description?: string;
  tableName: TableViewPresetTableName;
  filters: TableViewPresetState["filters"];
}): SystemTableViewPreset => ({
  id,
  name,
  description,
  tableName,
  state: {
    filters,
    columnOrder: [],
    columnVisibility: {},
    orderBy: null,
    searchQuery: "",
  },
});

const OBSERVATIONS_EVENTS_SYSTEM_TABLE_VIEW_PRESETS: SystemTableViewPreset[] = [
  buildFilterOnlySystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}trace_root_observations`,
    name: "Root Observations",
    description:
      "See top-level observations only, good for trace-level analysis",
    tableName: TableViewPresetTableName.ObservationsEvents,
    filters: [
      {
        column: "hasParentObservation",
        type: "boolean",
        operator: "=",
        value: false,
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
  buildFilterOnlySystemPreset({
    id: `${SYSTEM_TABLE_VIEW_PRESET_ID_PREFIX}errors_only`,
    name: "Errors Only",
    description: "Focus on observations that failed",
    tableName: TableViewPresetTableName.ObservationsEvents,
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
