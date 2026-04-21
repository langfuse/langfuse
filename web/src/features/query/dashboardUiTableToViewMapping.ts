import { z } from "zod";
import {
  findUiColumnMapping,
  singleFilter,
  type UiColumnMatchable,
} from "@langfuse/shared";
import { type views } from "@/src/features/query/types";

// Exported to silence @typescript-eslint/no-unused-vars v8 warning
// (used for type extraction via typeof, which is a legitimate pattern)
export const FilterArray = z.array(singleFilter);

/**
 * Central compatibility layer for dashboard/widget filter columns.
 *
 * Legacy dashboard filters can arrive in three shapes:
 * - uiTableName display labels from the old dashboard filter bar, e.g. "Model"
 * - uiTableId values from ad hoc callers, e.g. "model"
 * - explicit legacy aliases, e.g. "Tool Names"
 *
 * The query engine expects canonical view field names instead, e.g.
 * "providedModelName" or "toolNames". Widgets also need the inverse mapping
 * when reopening saved filters in the editor so persisted query fields render
 * with the current user-facing labels again.
 *
 * Keep all dashboard/widget filter migration and fallback logic in this module.
 * If a new legacy dashboard column shape needs to remain supported, add it to
 * this mapping rather than patching individual router or widget code paths.
 */
type DashboardViewFilterMapping = UiColumnMatchable & {
  viewName: string;
};

const viewMappings: Record<
  z.infer<typeof views>,
  readonly DashboardViewFilterMapping[]
> = {
  traces: [
    {
      uiTableName: "Trace Name",
      uiTableId: "traceName",
      viewName: "name",
    },
    {
      uiTableName: "Observation Name",
      uiTableId: "observationName",
      viewName: "observationName",
    },
    {
      uiTableName: "Score Name",
      uiTableId: "scoreName",
      viewName: "scoreName",
    },
    {
      uiTableName: "Tags",
      uiTableId: "traceTags",
      viewName: "tags",
    },
    {
      uiTableName: "User",
      uiTableId: "userId",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      uiTableId: "sessionId",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      uiTableId: "metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Release",
      uiTableId: "release",
      viewName: "release",
    },
    {
      uiTableName: "Version",
      uiTableId: "version",
      viewName: "version",
    },
    {
      uiTableName: "Environment",
      uiTableId: "environment",
      viewName: "environment",
    },
  ],
  observations: [
    {
      uiTableName: "Trace Name",
      uiTableId: "traceName",
      viewName: "traceName",
    },
    {
      uiTableName: "Observation Name",
      uiTableId: "observationName",
      viewName: "name",
    },
    {
      uiTableName: "Score Name",
      uiTableId: "scoreName",
      viewName: "scoreName",
    },
    {
      uiTableName: "User",
      uiTableId: "userId",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      uiTableId: "sessionId",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      uiTableId: "metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Type",
      uiTableId: "type",
      viewName: "type",
    },
    {
      uiTableName: "Tags",
      uiTableId: "traceTags",
      viewName: "tags",
    },
    {
      uiTableName: "Model",
      uiTableId: "model",
      viewName: "providedModelName",
    },
    {
      uiTableName: "Level",
      uiTableId: "level",
      viewName: "level",
    },
    {
      uiTableName: "Tool Names (Available)",
      uiTableId: "toolNames",
      aliases: ["Tool Names"],
      viewName: "toolNames",
    },
    {
      uiTableName: "Tool Names (Called)",
      uiTableId: "calledToolNames",
      viewName: "calledToolNames",
    },
    {
      uiTableName: "Environment",
      uiTableId: "environment",
      viewName: "environment",
    },
    {
      uiTableName: "Release",
      uiTableId: "release",
      viewName: "traceRelease",
    },
    {
      uiTableName: "Version",
      uiTableId: "version",
      viewName: "traceVersion",
    },
  ],
  "scores-numeric": [
    {
      uiTableName: "Score Name",
      uiTableId: "scoreName",
      viewName: "name",
    },
    {
      uiTableName: "Score Source",
      uiTableId: "scoreSource",
      viewName: "source",
    },
    {
      uiTableName: "Score Value",
      uiTableId: "value",
      aliases: ["value"],
      viewName: "value",
    },
    {
      uiTableName: "Scores Data Type",
      uiTableId: "scoreDataType",
      viewName: "dataType",
    },
    {
      uiTableName: "Tags",
      uiTableId: "traceTags",
      viewName: "tags",
    },
    {
      uiTableName: "Environment",
      uiTableId: "environment",
      viewName: "environment",
    },
    {
      uiTableName: "User",
      uiTableId: "userId",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      uiTableId: "sessionId",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      uiTableId: "metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Trace Name",
      uiTableId: "traceName",
      viewName: "traceName",
    },
    {
      uiTableName: "Observation Name",
      uiTableId: "observationName",
      viewName: "observationName",
    },
    {
      uiTableName: "Release",
      uiTableId: "release",
      viewName: "traceRelease",
    },
    {
      uiTableName: "Version",
      uiTableId: "version",
      viewName: "traceVersion",
    },
  ],
  "scores-categorical": [
    {
      uiTableName: "Score Name",
      uiTableId: "scoreName",
      viewName: "name",
    },
    {
      uiTableName: "Score Source",
      uiTableId: "scoreSource",
      viewName: "source",
    },
    {
      uiTableName: "Score String Value",
      uiTableId: "stringValue",
      viewName: "stringValue",
    },
    {
      uiTableName: "Scores Data Type",
      uiTableId: "scoreDataType",
      viewName: "dataType",
    },
    {
      uiTableName: "Tags",
      uiTableId: "traceTags",
      viewName: "tags",
    },
    {
      uiTableName: "Environment",
      uiTableId: "environment",
      viewName: "environment",
    },
    {
      uiTableName: "User",
      uiTableId: "userId",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      uiTableId: "sessionId",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      uiTableId: "metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Trace Name",
      uiTableId: "traceName",
      viewName: "traceName",
    },
    {
      uiTableName: "Observation Name",
      uiTableId: "observationName",
      viewName: "observationName",
    },
    {
      uiTableName: "Release",
      uiTableId: "release",
      viewName: "traceRelease",
    },
    {
      uiTableName: "Version",
      uiTableId: "version",
      viewName: "traceVersion",
    },
  ],
};

const allLegacyDashboardFilterMappings = Object.values(viewMappings).flat();

const findViewFilterMapping = (
  view: z.infer<typeof views>,
  column: string | undefined,
): DashboardViewFilterMapping | undefined =>
  findUiColumnMapping(viewMappings[view], column);

const isLegacyDashboardFilterColumn = (column: string | undefined): boolean =>
  findUiColumnMapping(allLegacyDashboardFilterMappings, column) !== undefined;

export const mapLegacyUiTableFilterToView = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): z.infer<typeof FilterArray> => {
  return filters.flatMap((filter) => {
    const definition = findViewFilterMapping(view, filter.column);

    if (definition) {
      return [{ ...filter, column: definition.viewName }];
    }

    if (isLegacyDashboardFilterColumn(filter.column)) {
      return [];
    }

    return [filter];
  });
};

export const mapViewFilterToUiTableFilter = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): z.infer<typeof FilterArray> => {
  return filters.map((filter) => {
    const definition = viewMappings[view].find(
      (mapping) => mapping.viewName === filter.column,
    );

    return definition ? { ...filter, column: definition.uiTableName } : filter;
  });
};
