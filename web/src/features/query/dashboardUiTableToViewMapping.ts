import { z } from "zod";
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
      uiTableName: "User",
      viewName: "userId",
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
  ],
};

const isLegacyUiTableFilter = (
  filter: z.infer<typeof singleFilter>,
): boolean => {
  return dashboardColumnDefinitions.some(
    (columnDef) => columnDef.uiTableName === filter.column,
  );
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
