import { type FilterCondition, type FilterState } from "@langfuse/shared";
import { resolveField } from "@/src/features/search-bar";

/**
 * Which of the events table's sidebar/search filters a chart can honour, and a
 * human reason for the ones it can't.
 *
 * The chart runs the observations aggregate query (`dashboard.executeQuery`,
 * v2 events read path — see `buildChartQuery`). That query accepts the columns
 * the widget builder offers as dimensions, plus `metadata`, which the query
 * builder takes as a keyed filter rather than a dimension. Measures, scores,
 * comments and a few structural columns have nothing to filter on, so they
 * CANNOT be applied to the chart.
 *
 * Rather than hide the chart when an unsupported filter is present (the old
 * all-or-nothing gate), we forward what we can and mark the rest as "not
 * applied" in the sidebar + search bar, with the reason on hover. This module
 * is the single source of truth for that split — pure, unit-tested, shared by
 * the query builder (what to forward), the add-to-dashboard mapper (what the
 * saved widget carries), and both filter surfaces (what to deactivate).
 */

/**
 * Events-table filter columns the chart query honours. Keyed by the `column`
 * string the events `FilterState` uses. Most forward 1:1 onto an observations
 * query dimension; `traceTags` is renamed to its dimension name (`tags`, see
 * {@link CHART_FILTER_COLUMN_RENAME}) and `metadata` is not a dimension at all
 * (see {@link chartConditionExclusionReason}). Column membership alone is not
 * sufficient — a condition also has to carry a shape the query accepts.
 */
const FORWARDABLE_CHART_FILTER_COLUMNS: ReadonlySet<string> = new Set([
  "environment",
  "type",
  "name",
  "level",
  "providedModelName",
  "traceName",
  "userId",
  "sessionId",
  "version",
  "release",
  "promptName",
  "promptVersion",
  "traceTags",
  "toolNames",
  "calledToolNames",
  "experimentName",
  "experimentDatasetId",
  "experimentId",
  "isRootObservation",
  "metadata",
]);

/**
 * Events-table filter column -> observations-view dimension name, for the few
 * that differ. Applied to a forwarded filter's `column` so the query targets
 * the right dimension. Columns not listed forward under their own name.
 */
const CHART_FILTER_COLUMN_RENAME: Readonly<Record<string, string>> = {
  traceTags: "tags",
};

// Column groups that share one "why it's not applied" explanation. Kept as
// literal sets (not derived) so the reason a user sees is deliberate copy, not
// a leak of internal column ids.
const MEASURE_COLUMNS = new Set([
  "latency",
  "timeToFirstToken",
  "inputTokens",
  "cachedInputTokens",
  "outputTokens",
  "totalTokens",
  "inputCost",
  "cachedInputCost",
  "outputCost",
  "totalCost",
]);

const SCORE_COLUMNS = new Set([
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
]);

const COMMENT_COLUMNS = new Set(["commentCount", "commentContent"]);

/** Reason shown when full-text search is active — not a `FilterState` column. */
export const CHART_SEARCH_QUERY_REASON =
  "Charts can't apply text search at the moment — still narrows the table.";

/**
 * Reason for a presence check (`has:`/`-has:`, a `null`-type filter). The
 * aggregate query reads the raw column, where an unset value is an empty string
 * or an empty array rather than NULL, so a presence check there does not select
 * the rows the table selects.
 */
const CHART_PRESENCE_FILTER_REASON =
  "Charts can't filter by whether a field is set at the moment — still applies to the table.";

/** Fallback for a column, or a filter shape, the chart query has no place for. */
const CHART_UNSUPPORTED_FIELD_REASON =
  "Charts can't filter by this field at the moment — still applies to the table.";

/**
 * The reason a filter on `column` is NOT applied to the chart, or `null` if it
 * is forwarded. User-facing hover copy: plain "not at the moment" framing —
 * present-tense and polite, without claiming a hard impossibility (none of these
 * are) or promising a roadmap — plus the reassurance that the filter still works
 * on the table. No "dimension"/"measure" jargon.
 */
export function chartFilterExclusionReason(column: string): string | null {
  if (FORWARDABLE_CHART_FILTER_COLUMNS.has(column)) return null;
  if (MEASURE_COLUMNS.has(column))
    return "Charts can't filter by latency, cost, or tokens at the moment — still applies to the table.";
  if (SCORE_COLUMNS.has(column))
    return "Charts can't filter by scores at the moment — still applies to the table.";
  if (COMMENT_COLUMNS.has(column))
    return "Charts can't filter by comments at the moment — still applies to the table.";
  return CHART_UNSUPPORTED_FIELD_REASON;
}

/**
 * The reason a single condition is NOT applied to the chart, or `null` if it is
 * forwarded. Condition-level, because a forwardable column can still carry a
 * shape the aggregate query rejects or answers differently from the table:
 *
 * - a presence check on any column ({@link CHART_PRESENCE_FILTER_REASON});
 * - `metadata` in anything but its keyed `stringObject` form — that is the only
 *   metadata shape the query builder accepts, and forwarding another one would
 *   error the whole chart rather than one filter.
 */
export function chartConditionExclusionReason(
  filter: FilterCondition,
): string | null {
  const columnReason = chartFilterExclusionReason(filter.column);
  if (columnReason) return columnReason;
  if (filter.type === "null") return CHART_PRESENCE_FILTER_REASON;
  if (filter.column === "metadata" && filter.type !== "stringObject")
    return CHART_UNSUPPORTED_FIELD_REASON;
  return null;
}

/**
 * Narrows a `FilterState` to the subset the chart query can honour, renaming
 * the few columns whose observations-view dimension name differs. The inverse
 * of {@link chartConditionExclusionReason} on the forwarding side.
 */
export function toChartFilters(filterState: FilterState): FilterState {
  return filterState
    .filter((f) => chartConditionExclusionReason(f) === null)
    .map((f) => {
      const renamed = CHART_FILTER_COLUMN_RENAME[f.column];
      return renamed ? { ...f, column: renamed } : f;
    });
}

/**
 * The reason a SEARCH-BAR field token is not applied to the chart, or `null` if
 * it is forwarded. Resolves a grammar field name (`level`, `user`, `latency`,
 * `scores.accuracy`, `metadata.region`) to its filter column via the bar's own
 * `resolveField`, so a token deactivates identically to its sidebar facet.
 */
export function chartSearchFieldReason(fieldName: string): string | null {
  const ref = resolveField(fieldName);
  if (!ref) return null;
  // A metadata dot-path lowers to the keyed `stringObject` shape the chart
  // query accepts, so it deactivates only if the column policy says so.
  if (ref.type === "metadata") return chartFilterExclusionReason("metadata");
  if (ref.type === "scores")
    return chartFilterExclusionReason(
      ref.level === "trace" ? "trace_scores_avg" : "scores_avg",
    );
  if (ref.type === "searchScope" || (ref.type === "pseudo" && ref.id === "in"))
    return CHART_SEARCH_QUERY_REASON;
  // `has:`/`-has:` lowers to a presence check, which the chart doesn't apply
  // (dropped by toChartFilters) — so the pill is deactivated too.
  if (ref.type === "pseudo") return CHART_PRESENCE_FILTER_REASON;
  return chartFilterExclusionReason(ref.field.id);
}

/**
 * Splits a `FilterState` into what the chart forwards and what it ignores, with
 * a per-column reason for the ignored ones. Both filter surfaces read the
 * `excluded` map (column -> reason) to deactivate the matching filter.
 */
export function classifyChartFilters(filterState: FilterState): {
  forwarded: FilterState;
  excluded: Map<string, string>;
} {
  const excluded = new Map<string, string>();
  for (const f of filterState) {
    const reason = chartConditionExclusionReason(f);
    if (reason) excluded.set(f.column, reason);
  }
  return { forwarded: toChartFilters(filterState), excluded };
}
