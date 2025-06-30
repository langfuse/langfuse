import { z } from "zod/v4";
import { dashboardColumnDefinitions, singleFilter } from "@langfuse/shared";
import { type views } from "@/src/features/query/types";

const FilterArray = z.array(singleFilter);

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
