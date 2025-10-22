import { evalConfigsTableCols } from "@/src/server/api/definitions/evalConfigsTable";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";

const EVALUATOR_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  status: "status",
  target: "target",
};

export const evaluatorFilterConfig: FilterConfig = {
  tableName: "evaluators",

  columnToQueryKey: EVALUATOR_COLUMN_TO_QUERY_KEY,

  columnDefinitions: evalConfigsTableCols,

  defaultExpanded: ["status"],

  defaultSidebarCollapsed: true,

  facets: [
    {
      type: "categorical" as const,
      column: "status",
      label: "Status",
    },
    {
      type: "categorical" as const,
      column: "target",
      label: "Target",
    },
  ],
};
