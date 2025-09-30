import type { ColumnToQueryKeyMap } from "@/src/features/filters/lib/filter-query-encoding";

export const TRACE_COLUMN_TO_QUERY_KEY: ColumnToQueryKeyMap = {
  name: "name",
  tags: "tags",
  environment: "env",
  level: "level",
  bookmarked: "bookmarked",
  latency: "latency",
};

export type TraceFilterQueryOptions = Record<
  keyof typeof TRACE_COLUMN_TO_QUERY_KEY,
  string[]
>;
