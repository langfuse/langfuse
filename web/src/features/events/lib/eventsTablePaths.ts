import { type FilterState } from "@langfuse/shared";
import {
  decodeFiltersGeneric,
  encodeFiltersGeneric,
} from "@/src/features/filters/lib/filter-query-encoding";

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

export type MetadataFilterOperator = "=" | "contains" | "does not contain";

type BuildEventsTablePathForMetadataFilterParams = {
  currentPath: string;
  projectId: string;
  metadataKey: string;
  value: string;
  operator: MetadataFilterOperator;
  /** Whether to land on the observations or traces events table. */
  target: "observations" | "traces";
};

/**
 * Builds an events-table URL that adds a `metadata` filter (a `stringObject`
 * clause). Unlike the name/type helpers above, this MERGES into any filters
 * already present in `currentPath` (e.g. the list filter behind a peek) so the
 * action reads as "add to filter" rather than "replace". The clicked value is
 * matched against the top-level metadata key — metadata is stored as a flat
 * `Map(String, String)`, so a nested value is filtered as a `contains` on its
 * top-level branch (the caller chooses the operator accordingly).
 */
export function buildEventsTablePathForMetadataFilter({
  currentPath,
  projectId,
  metadataKey,
  value,
  operator,
  target,
}: BuildEventsTablePathForMetadataFilterParams) {
  const url = new URL(currentPath, "https://langfuse.local");
  const params = new URLSearchParams();

  const dateRange = url.searchParams.get("dateRange");
  if (dateRange) {
    params.set("dateRange", dateRange);
  }

  const existingFilters = decodeFiltersGeneric(
    url.searchParams.get("filter") ?? "",
  );

  // Reconcile the new clause against any existing clause on this same
  // key+value, direction-aware:
  //  - Include (`contains`) only toggles the menu's OWN operators (contains /
  //    does not contain). A stricter clause set elsewhere — the filter-builder
  //    defaults stringObject to `=`, plus starts/ends with — is preserved, so a
  //    one-click Include never broadens an exact filter (`= v AND contains v`
  //    reduces to `= v`).
  //  - Exclude (`does not contain`) contradicts EVERY positive clause on the
  //    value (`= v`, `starts/ends with v` all imply it contains v), so it drops
  //    them all; otherwise `= v AND does not contain v` is always false and
  //    silently empties the table.
  // Clauses on other keys/values are always left untouched (AND-merge).
  const isExclude = operator === "does not contain";
  const withoutConflicting = existingFilters.filter((f) => {
    const sameTarget =
      f.column === "metadata" &&
      f.type === "stringObject" &&
      f.key === metadataKey &&
      f.value === value;
    if (!sameTarget) return true;
    if (isExclude) return false;
    return f.operator !== "contains" && f.operator !== "does not contain";
  });

  const filters: FilterState = [
    ...withoutConflicting,
    {
      column: "metadata",
      type: "stringObject",
      key: metadataKey,
      operator,
      value,
    },
  ];

  params.set("filter", encodeFiltersGeneric(filters));

  const query = params.toString();

  return `/project/${projectId}/${target}${query ? `?${query}` : ""}`;
}
