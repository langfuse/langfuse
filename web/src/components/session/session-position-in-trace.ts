import { type FilterState } from "@langfuse/shared";

type PositionInTraceFilter = Extract<
  FilterState[number],
  { type: "positionInTrace" }
>;
type PositionInTraceFilterInput = {
  key?: PositionInTraceFilter["key"];
  value?: string | number | undefined;
};

// `positionInTrace` only exists on the Sessions detail filter surface.
export const normalizeLegacySessionPositionInTraceKey = (key?: string) =>
  key === "root" ? "first" : key;

export const getSessionPositionInTraceFilterMode = (
  filter: PositionInTraceFilterInput,
) => normalizeLegacySessionPositionInTraceKey(filter.key) ?? "last";

export const normalizeLegacySessionPositionInTraceFilter = (
  filter: PositionInTraceFilter,
): PositionInTraceFilter => {
  const normalizedKey = normalizeLegacySessionPositionInTraceKey(filter.key);

  return normalizedKey === filter.key
    ? filter
    : { ...filter, key: normalizedKey as PositionInTraceFilter["key"] };
};

export const normalizeLegacySessionPositionInTraceFilters = (
  filters: FilterState,
): FilterState =>
  filters.map((filter) =>
    filter.type === "positionInTrace"
      ? normalizeLegacySessionPositionInTraceFilter(filter)
      : filter,
  );

export const formatSessionPositionInTraceFilterValue = (
  filter: PositionInTraceFilterInput,
) => {
  const mode = getSessionPositionInTraceFilterMode(filter);

  if (mode === "first") return "1st";
  if (mode === "last") return "last";

  const ordinal = typeof filter.value === "number" ? ` ${filter.value}` : "";

  return `${mode === "nthFromStart" ? "nth from start" : "nth from end"}${ordinal}`;
};
