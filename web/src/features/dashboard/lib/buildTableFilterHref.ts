import {
  type FilterCondition,
  type FilterState,
  observationsTableCols,
  tracesTableCols,
} from "@langfuse/shared";
import { type views } from "@langfuse/shared/query";
import { type z } from "zod";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import {
  classifyViewFiltersForTable,
  tableColumnIdForViewDimension,
  tableTargetForView,
} from "@/src/features/dashboard/lib/viewFilterToTableFilter";
import {
  encodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "@/src/features/filters/lib/filter-query-encoding";
import { rangeToString } from "@/src/utils/date-range-utils";

type ViewName = z.infer<typeof views>;

/**
 * One breakdown-category value to pin as an extra filter, e.g. a clicked
 * horizontal-bar-chart label: `{ column: "userId", value: "u-123" }`.
 * `column` is the widget's own view-space dimension field (the same string
 * as `widget.data.dimensions[0].field`) — already canonical, so it flows
 * through `classifyViewFiltersForTable` unchanged like any other filter.
 */
export interface CategoryFilter {
  column: string;
  value: string;
}

/**
 * Builds the single-value filter condition for a clicked breakdown category,
 * typed to match the DESTINATION table column rather than assumed — e.g. a
 * `stringOptions` column (most low-cardinality dimensions) needs `"any of"`
 * with an array value, while an `arrayOptions` column (tags, tool names)
 * needs an array-membership operator, not a scalar `"="`. Both filter shapes
 * are exact-match for a single value; the discriminant only changes which
 * SQL the destination table generates.
 *
 * Returns `undefined` for column types this drill-in can't safely express
 * (e.g. `stringObject`/`categoryOptions`, which need a `key` we don't have —
 * metadata/score breakdowns). Never guesses a shape that could silently
 * mis-filter.
 */
function buildCategoryFilterCondition(
  view: ViewName,
  categoryFilter: CategoryFilter,
): FilterCondition | undefined {
  const tableColId = tableColumnIdForViewDimension(view, categoryFilter.column);
  if (!tableColId) return undefined;

  const cols =
    tableTargetForView(view) === "observations"
      ? observationsTableCols
      : tracesTableCols;
  const colType = cols.find((c) => c.id === tableColId)?.type;

  switch (colType) {
    case "string":
      return {
        column: categoryFilter.column,
        type: "string",
        operator: "=",
        value: categoryFilter.value,
      };
    case "stringOptions":
      return {
        column: categoryFilter.column,
        type: "stringOptions",
        operator: "any of",
        value: [categoryFilter.value],
      };
    case "arrayOptions":
      return {
        column: categoryFilter.column,
        type: "arrayOptions",
        operator: "any of",
        value: [categoryFilter.value],
      };
    default:
      return undefined;
  }
}

export interface TableFilterHrefResult {
  /** `/project/<id>/<table>?filter=...&dateRange=...` ready for `router.push`. */
  href: string;
  /**
   * Widget dimensions the target table can't express, dropped from the filter.
   * Keyed by view dimension -> human reason. Non-empty means the table shows a
   * superset of the widget's data.
   */
  notApplicable: Map<string, string>;
  /**
   * Applicable filters additionally dropped so the `?filter=` value stays
   * within `MAX_URL_FILTER_QUERY_LENGTH` (avoids a 431 on the round-trip).
   */
  droppedForLength: number;
  /**
   * Whether the requested `categoryFilter` (if any) actually made it into
   * `href`. `false` means the dimension's column type can't be expressed as
   * a table filter (e.g. metadata/score breakdowns) — callers building a
   * "drill into this row" link MUST check this before offering the link, so
   * it never lands on an unfiltered table while implying otherwise. `true`
   * when no `categoryFilter` was requested at all (nothing to fail).
   */
  categoryFilterApplied: boolean;
}

/**
 * Encode `filters` for the URL, dropping the largest-serialized filters first
 * until the value fits `MAX_URL_FILTER_QUERY_LENGTH`. Runaway high-cardinality
 * filters are the usual budget hogs (LFE-10717), so removing the biggest keeps
 * the most individual filters intact while guaranteeing the link still loads.
 */
function encodeFiltersWithinBudget(filters: FilterState): {
  encoded: string;
  droppedForLength: number;
  /** The filters that survived trimming — lets a caller check whether one
   *  particular filter it cares about (e.g. a category drill-in) made it
   *  into the final `encoded` string. */
  kept: FilterState;
} {
  let kept = filters;
  let encoded = encodeFiltersGeneric(kept);
  let droppedForLength = 0;

  while (kept.length > 0 && encoded.length > MAX_URL_FILTER_QUERY_LENGTH) {
    let biggestIdx = 0;
    let biggestLen = -1;
    for (let i = 0; i < kept.length; i++) {
      const len = encodeFiltersGeneric([kept[i]]).length;
      if (len > biggestLen) {
        biggestLen = len;
        biggestIdx = i;
      }
    }
    kept = kept.filter((_, i) => i !== biggestIdx);
    droppedForLength += 1;
    encoded = encodeFiltersGeneric(kept);
  }

  return { encoded, droppedForLength, kept };
}

/**
 * Build the traces/observations-table link that shows the same data as a
 * widget: the widget's filters translated to the table's applicable filters
 * (filters the table can't express are dropped, not errored) plus the widget's
 * time range.
 *
 * `filters` are the widget's raw ui-table filters (widget config + dashboard
 * global filters); they are normalized to view space here before classifying.
 * `dateRange` is the dashboard's absolute range; when absent the table keeps
 * its own stored/default range.
 *
 * Normalization uses `mapLegacyUiTableFilterToView` (the "stored" variant), the
 * SAME mapping DashboardWidget's own query build applies to widget +
 * dashboard-global filters. This matters where the two variants diverge on a
 * legacy alias: e.g. a dashboard-global "Version" filter on an observations
 * widget maps to `traceVersion` (which the observations table correctly drops)
 * under the stored variant, but to the observation `version` column under the
 * editor variant — which would filter a different field than the chart did.
 *
 * `categoryFilter` additionally pins one breakdown-category value (e.g. a
 * clicked bar-chart label) on top of the widget's own filters — the "drill
 * into this row" deep link. It is classified/encoded through the exact same
 * pipeline as every other filter, so it is dropped (not mis-applied) if the
 * dimension can't be expressed as a table filter.
 */
export function buildTableFilterHref(
  projectId: string,
  view: ViewName,
  filters: FilterState,
  dateRange: { from: Date; to: Date } | undefined,
  categoryFilter?: CategoryFilter,
): TableFilterHrefResult {
  const table = tableTargetForView(view);

  const viewFilters = mapLegacyUiTableFilterToView(view, filters);
  const categoryViewFilter = categoryFilter
    ? buildCategoryFilterCondition(view, categoryFilter)
    : undefined;
  const { applicable, notApplicable } = classifyViewFiltersForTable(view, [
    ...viewFilters,
    ...(categoryViewFilter ? [categoryViewFilter] : []),
  ]);

  const { encoded, droppedForLength, kept } =
    encodeFiltersWithinBudget(applicable);

  // Encode each param value with encodeURIComponent so the space in operators
  // like "any of" becomes %20 (unambiguous across the query-string parser the
  // destination table uses — a "+" would depend on form-encoding semantics).
  // encodeFiltersGeneric already percent-encodes the value layer, so this is
  // the single outer transport-encoding the parser reverses once.
  const queryParts: string[] = [];
  if (encoded.length > 0) {
    queryParts.push(`filter=${encodeURIComponent(encoded)}`);
  }
  if (dateRange) {
    queryParts.push(
      `dateRange=${encodeURIComponent(rangeToString(dateRange))}`,
    );
  }

  const query = queryParts.join("&");
  const href = `/project/${projectId}/${table}${query ? `?${query}` : ""}`;

  // Survived both classification (a real, expressible column) AND the
  // length-budget trim — checked by value since classification already
  // rewrote its `column` to the table's column id.
  const categoryTableColId = categoryFilter
    ? tableColumnIdForViewDimension(view, categoryFilter.column)
    : undefined;
  const categoryFilterApplied =
    !categoryFilter ||
    (categoryViewFilter !== undefined &&
      kept.some(
        (f) =>
          f.column === categoryTableColId &&
          JSON.stringify(f.value) === JSON.stringify(categoryViewFilter.value),
      ));

  return { href, notApplicable, droppedForLength, categoryFilterApplied };
}

/**
 * Builds the per-category "drill in" href map for a breakdown chart's bars:
 * one `buildTableFilterHref` call (pinned to `column = value`) per unique,
 * filterable value in `dimensionValues`, keyed by that value. Extracted from
 * DashboardWidget's `categoryTableHrefs` memo as its own seam so the
 * guard below is unit-testable in isolation.
 *
 * `excludeValues`, when given, are skipped even though they are strings —
 * display labels that look like a value but aren't a real, single filterable
 * one:
 *  - the collapsed null-dimension bucket ("n/a" — DashboardWidget's own
 *    sentinel constant, not guessed here): linking it would pin
 *    `column = "n/a"` and land on zero/wrong rows (worse, for a by-user-ID
 *    breakdown the null bucket is often the largest bar).
 *  - a whole-array bucket (e.g. an un-exploded `tags` dimension): the chart
 *    label joins the array into one string (`"prod, urgent"`), but no row's
 *    column literally equals that joined string — an "any of" filter on it
 *    would silently land on zero rows, same failure class as the n/a case.
 * The caller passes its own set rather than this module guessing one.
 * (LFE-10962)
 *
 * A value whose column type can't be expressed as a table filter
 * (`categoryFilterApplied=false` — e.g. a metadata/score breakdown) is
 * likewise omitted, rather than linking to an unfiltered table under a
 * "drill in" label.
 */
export function buildCategoryTableHrefs(
  projectId: string,
  view: ViewName,
  filters: FilterState,
  dateRange: { from: Date; to: Date } | undefined,
  column: string,
  dimensionValues: ReadonlyArray<unknown>,
  excludeValues?: ReadonlySet<string>,
): Map<string, string> {
  const hrefs = new Map<string, string>();
  for (const value of dimensionValues) {
    if (
      typeof value !== "string" ||
      excludeValues?.has(value) ||
      hrefs.has(value)
    )
      continue;

    const result = buildTableFilterHref(projectId, view, filters, dateRange, {
      column,
      value,
    });
    if (result.categoryFilterApplied) {
      hrefs.set(value, result.href);
    }
  }
  return hrefs;
}

export interface ViewAsTableHint {
  /**
   * Total widget filters not reflected in the table: dimensions the table
   * can't express plus applicable filters dropped to fit the URL budget.
   */
  count: number;
  /** Newline-joined reasons, suitable for a tooltip. */
  title: string;
}

/**
 * Build the "N filters not shown" hint for a View-as-table result. Combines
 * the not-applicable dimensions with the filters dropped purely for URL length
 * so a length-drop is never silent — landing on a table quietly missing a
 * configured filter would break the "dropped with a hint, never mis-applied"
 * guarantee. Returns null when nothing was dropped.
 */
export function buildViewAsTableHint(
  result: TableFilterHrefResult,
): ViewAsTableHint | null {
  const count = result.notApplicable.size + result.droppedForLength;
  if (count === 0) return null;

  const reasons = Array.from(result.notApplicable.values());
  if (result.droppedForLength > 0) {
    reasons.push(
      `${result.droppedForLength} filter${
        result.droppedForLength === 1 ? "" : "s"
      } dropped to keep the table URL within limits.`,
    );
  }

  return { count, title: reasons.join("\n") };
}
