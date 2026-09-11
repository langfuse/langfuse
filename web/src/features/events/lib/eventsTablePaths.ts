import {
  type FilterState,
  TABLE_AGGREGATION_OPTIONS,
  TIME_RANGES,
  decodeFiltersGeneric,
  encodeFiltersGeneric,
  rangeToString,
} from "@langfuse/shared";

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

/**
 * Builds an events-table URL that adds a filter on a regular table column
 * (environment, model, version, release, ...). Like the metadata helper below
 * it MERGES into the filters already in `currentPath`, replacing any existing
 * clause on the same column so the click reads as "filter by this value".
 */
/**
 * Smallest table preset whose window still contains `time`, or an absolute
 * day-sized range when nothing does. Without this a filter link opened from an
 * older observation lands on a table whose default "past 1 day" window is
 * empty — the filter applied, the row it came from is just out of range.
 */
function dateRangeCovering(time: Date, now = new Date()): string {
  const ageMinutes = (now.getTime() - time.getTime()) / 60_000;
  for (const option of TABLE_AGGREGATION_OPTIONS) {
    const minutes = TIME_RANGES[option].minutes;
    if (minutes != null && ageMinutes < minutes * 0.9) {
      return rangeToString({ range: option });
    }
  }
  const dayMs = 24 * 60 * 60_000;
  return rangeToString({
    from: new Date(time.getTime() - dayMs),
    to: new Date(Math.min(now.getTime(), time.getTime() + dayMs)),
  });
}

function rangeCovers(encoded: string, time: Date, now = new Date()): boolean {
  const preset = Object.values(TIME_RANGES).find(
    (def) => def.abbreviation === encoded,
  );
  if (preset?.minutes != null) {
    return now.getTime() - time.getTime() < preset.minutes * 60_000;
  }
  const [from, to] = encoded.split("-").map(Number);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    return time.getTime() >= from && time.getTime() <= to;
  }
  return false;
}

export function buildEventsTablePathForColumnFilter({
  currentPath,
  projectId,
  target,
  filter,
  coverTime,
}: {
  currentPath: string;
  projectId: string;
  target: "observations" | "traces";
  filter: FilterState[number];
  /** A time the resulting table window must include (the source row's start). */
  coverTime?: Date;
}) {
  const url = new URL(currentPath, "https://langfuse.local");
  const params = new URLSearchParams();

  const dateRange = url.searchParams.get("dateRange");
  if (coverTime && !(dateRange && rangeCovers(dateRange, coverTime))) {
    params.set("dateRange", dateRangeCovering(coverTime));
  } else if (dateRange) {
    params.set("dateRange", dateRange);
  }

  const existingFilters = decodeFiltersGeneric(
    url.searchParams.get("filter") ?? "",
  ).filter((f) => f.column !== filter.column);

  params.set("filter", encodeFiltersGeneric([...existingFilters, filter]));

  const query = params.toString();

  return `/project/${projectId}/${target}${query ? `?${query}` : ""}`;
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
