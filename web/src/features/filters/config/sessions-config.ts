import { omitFilterFacets } from "@/src/features/filters/lib/filter-config";
import { sessionsEventsViewCols, sessionsViewCols } from "@langfuse/shared";
import type {
  Facet,
  FilterConfig,
} from "@/src/features/filters/lib/filter-config";
import type { ColumnToBackendKeyMap } from "@/src/features/filters/lib/filter-transform";

export type SessionOmittableFilterColumn = "userIds";

/**
 * Maps frontend column IDs to backend-expected column IDs
 * Frontend uses "tags" but backend CH mapping expects "traceTags" for trace tags on sessions table
 */
export const SESSION_COLUMN_TO_BACKEND_KEY: ColumnToBackendKeyMap = {
  tags: "traceTags",
};

export const sessionFilterConfig: FilterConfig = {
  tableName: "sessions",

  columnDefinitions: sessionsViewCols,

  defaultExpanded: ["environment", "bookmarked"],

  facets: [
    {
      type: "categorical" as const,
      column: "environment",
      label: "Environment",
    },
    {
      type: "string" as const,
      column: "id",
      label: "Session ID",
    },
    {
      type: "categorical" as const,
      column: "userIds",
      label: "User IDs",
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Trace Tags",
    },
    {
      type: "boolean" as const,
      column: "bookmarked",
      label: "Bookmarked",
      trueLabel: "Bookmarked",
      falseLabel: "Not bookmarked",
    },
    {
      type: "numeric" as const,
      column: "sessionDuration",
      label: "Session Duration",
      min: 0,
      max: 3600,
      unit: "s",
    },
    {
      type: "numeric" as const,
      column: "countTraces",
      label: "Traces Count",
      min: 0,
      max: 1000,
    },
    {
      type: "numeric" as const,
      column: "inputTokens",
      label: "Input Tokens",
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "outputTokens",
      label: "Output Tokens",
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "totalTokens",
      label: "Total Tokens",
      min: 0,
      max: 1000000,
    },
    {
      type: "numeric" as const,
      column: "inputCost",
      label: "Input Cost",
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "numeric" as const,
      column: "outputCost",
      label: "Output Cost",
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "numeric" as const,
      column: "totalCost",
      label: "Total Cost",
      min: 0,
      max: 100,
      unit: "$",
    },
    {
      type: "keyValue" as const,
      column: "score_categories",
      label: "Categorical Scores",
    },
    {
      type: "numericKeyValue" as const,
      column: "scores_avg",
      label: "Numeric Scores",
    },
    {
      type: "booleanKeyValue" as const,
      column: "score_booleans",
      label: "Boolean Scores",
    },
    {
      type: "numeric" as const,
      column: "commentCount",
      label: "Comment Count",
      min: 0,
      max: 100,
    },
    {
      type: "string" as const,
      column: "commentContent",
      label: "Comment Content",
    },
  ],
};

const sessionMetadataFacet: Facet = {
  type: "stringKeyValue",
  column: "metadata",
  label: "Metadata",
};

export const sessionEventsFilterConfig: FilterConfig = {
  ...sessionFilterConfig,
  columnDefinitions: sessionsEventsViewCols,
  facets: sessionFilterConfig.facets.flatMap((facet) =>
    facet.column === "tags" ? [facet, sessionMetadataFacet] : [facet],
  ),
};

export function getSessionFilterConfig(
  omittedFilter: SessionOmittableFilterColumn[] = [],
  fromEvents = false,
): FilterConfig {
  return omitFilterFacets(
    fromEvents ? sessionEventsFilterConfig : sessionFilterConfig,
    omittedFilter,
  );
}
