import { z } from "zod";
import { dashboardColumnDefinitions, singleFilter } from "@langfuse/shared";
import { type views } from "@/src/features/query/types";

// Exported to silence @typescript-eslint/no-unused-vars v8 warning
// (used for type extraction via typeof, which is a legitimate pattern)
export const FilterArray = z.array(singleFilter);

const viewMappings: Record<z.infer<typeof views>, Record<string, string>[]> = {
  traces: [
    {
      uiTableName: "Trace Name",
      viewName: "name",
    },
    {
      uiTableName: "Observation Name",
      viewName: "observationName",
    },
    {
      uiTableName: "Score Name",
      viewName: "scoreName",
    },
    {
      uiTableName: "Tags",
      viewName: "tags",
    },
    {
      uiTableName: "User",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Release",
      viewName: "release",
    },
    {
      uiTableName: "Version",
      viewName: "version",
    },
    {
      uiTableName: "Environment",
      viewName: "environment",
    },
  ],
  observations: [
    {
      uiTableName: "Trace Name",
      viewName: "traceName",
    },
    {
      uiTableName: "Observation Name",
      viewName: "name",
    },
    {
      uiTableName: "Score Name",
      viewName: "scoreName",
    },
    {
      uiTableName: "User",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Type",
      viewName: "type",
    },
    {
      uiTableName: "Tags",
      viewName: "tags",
    },
    {
      uiTableName: "Model",
      viewName: "providedModelName",
    },
    {
      uiTableName: "Level",
      viewName: "level",
    },
    {
      uiTableName: "Tool Names",
      viewName: "toolNames",
    },
    {
      uiTableName: "Environment",
      viewName: "environment",
    },
    {
      uiTableName: "Release",
      viewName: "traceRelease",
    },
    {
      uiTableName: "Version",
      viewName: "traceVersion",
    },
  ],
  "scores-numeric": [
    {
      uiTableName: "Score Name",
      viewName: "name",
    },
    {
      uiTableName: "Score Source",
      viewName: "source",
    },
    {
      uiTableName: "Score Value",
      viewName: "value",
    },
    {
      // Legacy column name from dashboardColumnDefinitions (uiTableName: "value")
      uiTableName: "value",
      viewName: "value",
    },
    {
      uiTableName: "Scores Data Type",
      viewName: "dataType",
    },
    {
      uiTableName: "Tags",
      viewName: "tags",
    },
    {
      uiTableName: "Environment",
      viewName: "environment",
    },
    {
      uiTableName: "User",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Trace Name",
      viewName: "traceName",
    },
    {
      uiTableName: "Observation Name",
      viewName: "observationName",
    },
    {
      uiTableName: "Release",
      viewName: "traceRelease",
    },
    {
      uiTableName: "Version",
      viewName: "traceVersion",
    },
  ],
  "scores-categorical": [
    {
      uiTableName: "Score Name",
      viewName: "name",
    },
    {
      uiTableName: "Score Source",
      viewName: "source",
    },
    {
      uiTableName: "Score String Value",
      viewName: "stringValue",
    },
    {
      uiTableName: "Scores Data Type",
      viewName: "dataType",
    },
    {
      uiTableName: "Tags",
      viewName: "tags",
    },
    {
      uiTableName: "Environment",
      viewName: "environment",
    },
    {
      uiTableName: "User",
      viewName: "userId",
    },
    {
      uiTableName: "Session",
      viewName: "sessionId",
    },
    {
      uiTableName: "Metadata",
      viewName: "metadata",
    },
    {
      uiTableName: "Trace Name",
      viewName: "traceName",
    },
    {
      uiTableName: "Observation Name",
      viewName: "observationName",
    },
    {
      uiTableName: "Release",
      viewName: "traceRelease",
    },
    {
      uiTableName: "Version",
      viewName: "traceVersion",
    },
  ],
};

const isLegacyUiTableFilter = (
  filter: z.infer<typeof singleFilter>,
): boolean => {
  return dashboardColumnDefinitions
    .concat([
      {
        uiTableName: "Session",
        uiTableId: "sessionId",
        clickhouseTableName: "traces",
        clickhouseSelect: 't."sessionId"',
      },
      {
        uiTableName: "Observation Name",
        uiTableId: "observationName",
        clickhouseTableName: "observations",
        clickhouseSelect: 'o."name"',
      },
      {
        uiTableName: "Metadata",
        uiTableId: "metadata",
        clickhouseTableName: "traces",
        clickhouseSelect: 't."metadata"',
      },
      {
        uiTableName: "Score Value",
        uiTableId: "value",
        clickhouseTableName: "scores",
        clickhouseSelect: 's."value"',
      },
      {
        uiTableName: "Score String Value",
        uiTableId: "stringValue",
        clickhouseTableName: "scores",
        clickhouseSelect: 's."string_value"',
      },
    ])
    .some((columnDef) => columnDef.uiTableName === filter.column);
};

export const mapLegacyUiTableFilterToView = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): z.infer<typeof FilterArray> => {
  return filters.flatMap((filter) => {
    // If it's not a legacy filter, return it as is
    if (!isLegacyUiTableFilter(filter)) {
      return [filter];
    }
    // Check if we have a match in our mapping
    const definition = viewMappings[view].find(
      (def) => def.uiTableName === filter.column,
    );
    // Ignore if there is no match
    if (!definition) {
      return [];
    }
    // Overwrite column name if a match is found
    return [{ ...filter, column: definition.viewName }];
  });
};

/**
 * Reverse mapping: converts persisted view-level filter column names back to
 * the widget form's filterColumns identifiers so that the filter builder UI
 * can match them and display the correct column label.
 *
 * `targetColumns` is the array of ColumnDefinition objects used by the widget
 * form's InlineFilterBuilder. A filter column value is remapped when it does
 * not already match any column `id` or `name` in `targetColumns` but does
 * match a `viewName` in the view mappings – in which case we look up the
 * corresponding `uiTableName` and then resolve it to the matching
 * targetColumn's `id`.
 */
export const mapViewFilterToWidgetFormFilter = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
  targetColumns: { id: string; name: string }[],
): z.infer<typeof FilterArray> => {
  return filters.map((filter) => {
    // If the column already matches a target column id or name, no mapping needed
    const alreadyMatched = targetColumns.some(
      (c) => c.id === filter.column || c.name === filter.column,
    );
    if (alreadyMatched) {
      return filter;
    }

    // Try to find a view mapping entry where the viewName matches the filter column
    const definition = viewMappings[view]?.find(
      (def) => def.viewName === filter.column,
    );
    if (!definition) {
      return filter;
    }

    // Find the matching target column by uiTableName
    const targetColumn = targetColumns.find(
      (c) =>
        c.name === definition.uiTableName || c.id === definition.uiTableName,
    );
    if (!targetColumn) {
      return filter;
    }

    return { ...filter, column: targetColumn.name };
  });
};
