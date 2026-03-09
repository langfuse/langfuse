import { type FilterState } from "@langfuse/shared";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";

type BuildEventsTablePathForSpanNameParams = {
  currentPath: string;
  projectId: string;
  spanName: string;
};

type BuildEventsTablePathForObservationTypeParams = {
  currentPath: string;
  projectId: string;
  observationType: string;
};

function buildEventsTablePathForStringFilter({
  currentPath,
  projectId,
  column,
  value,
}: {
  currentPath: string;
  projectId: string;
  column: "name" | "type";
  value: string;
}) {
  const url = new URL(currentPath, "https://langfuse.local");
  const params = new URLSearchParams();
  const dateRange = url.searchParams.get("dateRange");

  if (dateRange) {
    params.set("dateRange", dateRange);
  }

  const filters: FilterState = [
    {
      column,
      type: "stringOptions",
      operator: "any of",
      value: [value],
    },
  ];

  params.set("filter", encodeFiltersGeneric(filters));

  const query = params.toString();

  return `/project/${projectId}/observations${query ? `?${query}` : ""}`;
}

export function buildEventsTablePathForSpanName({
  currentPath,
  projectId,
  spanName,
}: BuildEventsTablePathForSpanNameParams) {
  return buildEventsTablePathForStringFilter({
    currentPath,
    projectId,
    column: "name",
    value: spanName,
  });
}

export function buildEventsTablePathForObservationType({
  currentPath,
  projectId,
  observationType,
}: BuildEventsTablePathForObservationTypeParams) {
  return buildEventsTablePathForStringFilter({
    currentPath,
    projectId,
    column: "type",
    value: observationType,
  });
}
