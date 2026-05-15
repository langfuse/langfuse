import { type FilterState } from "@langfuse/shared";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";

export type TraceMetadataFilterRequest = {
  key: string;
  value: unknown;
};

export type TraceMetadataFilterHandler = (
  request: TraceMetadataFilterRequest,
) => void;

const PEEK_QUERY_PARAMS = [
  "peek",
  "observation",
  "display",
  "timestamp",
  "traceId",
];

const PAGINATION_QUERY_PARAMS = ["page", "pageIndex"];

export function getTraceMetadataFilterValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function getTraceMetadataFilterKeyFromRowId(rowId: string) {
  const key = rowId.replaceAll("-", ".").trim();
  return key.length > 0 ? key : null;
}

export function getTraceMetadataFilterKeyFromPath(
  path: Array<string | number>,
) {
  const [, ...metadataPath] = path;
  const key = metadataPath.map(String).join(".").trim();
  return key.length > 0 ? key : null;
}

export function addTraceMetadataFilter(
  filters: FilterState,
  request: TraceMetadataFilterRequest,
): FilterState {
  const key = request.key.trim();
  const value = getTraceMetadataFilterValue(request.value);

  if (!key || value === null) return filters;

  const metadataFilter = {
    column: "metadata",
    type: "stringObject",
    key,
    operator: "=",
    value,
  } satisfies FilterState[number];

  const filtersWithoutDuplicate = filters.filter(
    (filter) =>
      !(
        filter.column === metadataFilter.column &&
        filter.type === metadataFilter.type &&
        filter.key === metadataFilter.key &&
        filter.operator === metadataFilter.operator &&
        filter.value === metadataFilter.value
      ),
  );

  return [...filtersWithoutDuplicate, metadataFilter];
}

export function buildNewTracesTablePathWithMetadataFilter({
  currentPath,
  projectId,
  filters,
  request,
}: {
  currentPath: string;
  projectId: string;
  filters: FilterState;
  request: TraceMetadataFilterRequest;
}) {
  const url = new URL(currentPath, "https://langfuse.local");
  const params = new URLSearchParams(url.search);
  const nextFilters = addTraceMetadataFilter(filters, request);
  const encodedFilters = encodeFiltersGeneric(nextFilters);

  PEEK_QUERY_PARAMS.forEach((param) => params.delete(param));
  PAGINATION_QUERY_PARAMS.forEach((param) => params.delete(param));

  if (encodedFilters) {
    params.set("filter", encodedFilters);
  } else {
    params.delete("filter");
  }

  const query = params.toString();
  return `/project/${projectId}/traces${query ? `?${query}` : ""}`;
}
