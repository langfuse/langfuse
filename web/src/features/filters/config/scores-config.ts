import { scoresTableCols } from "@/src/server/api/definitions/scoresTable";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";

const SCORE_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  source: "source",
  dataType: "dataType",
  name: "name",
  value: "value",
};

export const scoreFilterConfig: FilterConfig = {
  tableName: "scores",

  columnToQueryKey: SCORE_COLUMN_TO_QUERY_KEY,

  columnDefinitions: scoresTableCols,

  defaultExpanded: ["name"],

  facets: [
    {
      type: "categorical" as const,
      column: "name",
      label: "Name",
    },
    {
      type: "categorical" as const,
      column: "source",
      label: "Source",
    },
    {
      type: "categorical" as const,
      column: "dataType",
      label: "Data Type",
    },
    {
      type: "numeric" as const,
      column: "value",
      label: "Value",
      min: -100,
      max: 100,
    },
  ],
};
