// Alphabetical ordering for tag filter options (LFE-14382).
//
// Tag values arrive in backend order, which is not alphabetical: the legacy
// traces query has no ORDER BY at all, and ClickHouse's ORDER BY is bytewise
// ("Zebra" before "apple"). Sorting in the browser also gets the viewer's own
// locale. Other facets keep their count-descending order on purpose.
//
// Relevance still wins while typing: rankFilter/rankFacetOptions are stable, so
// this only decides the idle list and the order within each rank group.

type OptionValue = string | { value: string };

const valueOf = (option: OptionValue): string =>
  typeof option === "string" ? option : option.value;

/**
 * A→Z copy of an option list, `string[]` or `{ value, … }[]`. `undefined` passes
 * through — callers distinguish it from `[]` as "not loaded yet".
 */
export function sortOptionValues<T extends OptionValue>(
  options: readonly T[],
): T[];
export function sortOptionValues<T extends OptionValue>(
  options: readonly T[] | undefined,
): T[] | undefined;
export function sortOptionValues<T extends OptionValue>(
  options: readonly T[] | undefined,
): T[] | undefined {
  return options
    ? [...options].sort((a, b) => valueOf(a).localeCompare(valueOf(b)))
    : options;
}
