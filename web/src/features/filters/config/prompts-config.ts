import { promptsTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";

const PROMPT_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  type: "type",
  labels: "labels",
  tags: "tags",
  version: "version",
};

export const promptFilterConfig: FilterConfig = {
  tableName: "prompts",

  columnToQueryKey: PROMPT_COLUMN_TO_QUERY_KEY,

  columnDefinitions: promptsTableCols,

  defaultExpanded: ["type"],

  defaultSidebarCollapsed: true,

  facets: [
    {
      type: "categorical" as const,
      column: "type",
      label: "Type",
    },
    {
      type: "categorical" as const,
      column: "labels",
      label: "Labels",
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Tags",
    },
    {
      type: "numeric" as const,
      column: "version",
      label: "Version",
      min: 1,
      max: 100,
    },
  ],
};
