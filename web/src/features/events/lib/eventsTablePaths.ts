import { type FilterState } from "@langfuse/shared";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";

type BuildEventsTablePathForSpanNameParams = {
  currentPath: string;
  projectId: string;
  spanName: string;
};

const EVENT_TABLE_PARAMS_TO_CLEAR = [
  "peek",
  "observation",
  "traceId",
  "timestamp",
  "display",
  "traceTab",
  "pref",
  "view",
  "search",
  "searchType",
  "page",
  "pageIndex",
  "pageSize",
  "limit",
  "viewId",
];

export function buildEventsTablePathForSpanName({
  currentPath,
  projectId,
  spanName,
}: BuildEventsTablePathForSpanNameParams) {
  const url = new URL(currentPath, "https://langfuse.local");
  const params = new URLSearchParams(url.search);

  EVENT_TABLE_PARAMS_TO_CLEAR.forEach((param) => params.delete(param));

  const filters: FilterState = [
    {
      column: "name",
      type: "stringOptions",
      operator: "any of",
      value: [spanName],
    },
  ];

  params.set("filter", encodeFiltersGeneric(filters));

  const query = params.toString();

  return `/project/${projectId}/observations${query ? `?${query}` : ""}`;
}
