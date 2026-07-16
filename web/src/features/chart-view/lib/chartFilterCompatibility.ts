import { type FilterState } from "@langfuse/shared";
import { resolveField } from "@/src/features/search-bar/lib/fields";

/**
 * Which of the events table's sidebar/search filters a chart can honour, and a
 * human reason for the ones it can't.
 *
 * The chart runs the observations aggregate query (`dashboard.executeQuery`,
 * v2 events read path — see `buildChartQuery`). That query accepts a subset of
 * the columns the events table exposes as filters: the dimensions the widget
 * builder also offers (LFE-10751). Everything else — measures, scores,
 * comments, metadata, and a few structural columns — has no dimension to filter
 * on, so it CANNOT be applied to the chart.
 *
 * Rather than hide the chart when an unsupported filter is present (the old
 * all-or-nothing gate), we forward what we can and mark the rest as "not
 * applied" in the sidebar + search bar, with the reason on hover. This module
 * is the single source of truth for that split — pure, unit-tested, shared by
 * the query builder (what to forward), the add-to-dashboard mapper (what the
 * saved widget carries), and both filter surfaces (what to deactivate).
 */

/**
 * Events-table filter columns whose values forward 1:1 onto an observations
 * query dimension. Keyed by the `column` string the events `FilterState` uses.
 * `traceTags` is the one whose query dimension name differs (`tags`) — see
 * {@link CHART_FILTER_COLUMN_RENAME}.
 */
export const FORWARDABLE_CHART_FILTER_COLUMNS: ReadonlySet<string> = new Set([
  "environment",
  "type",
  "name",
  "level",
  "providedModelName",
  "traceName",
  "userId",
  "sessionId",
  "version",
  "promptName",
  // NOTE: promptVersion is intentionally NOT forwardable. The search-bar
  // grammar registers it as a numeric field, so `promptVersion:>2` lowers to a
  // `number` filter — but the observations-view dimension is typed `string`,
  // which rejects numeric filters and errors the chart query. It shows as "not
  // applied" instead.
  "traceTags",
  "toolNames",
  "calledToolNames",
  "experimentName",
  "experimentDatasetId",
  "experimentId",
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
  "outputTokens",
  "totalTokens",
  "inputCost",
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
  if (column === "metadata")
    return "Charts can't filter by metadata at the moment — still applies to the table.";
  return "Charts can't filter by this field at the moment — still applies to the table.";
}

/**
 * Narrows a `FilterState` to the subset the chart query can honour, renaming
 * the few columns whose observations-view dimension name differs. The inverse
 * of {@link chartFilterExclusionReason} on the forwarding side.
 */
export function toChartFilters(filterState: FilterState): FilterState {
  return filterState
    .filter(
      (f) =>
        // Presence checks (`has:`/`-has:`, a `null` filter) aren't applied by
        // the aggregate chart query — drop them so we never forward one and
        // 422; the search bar marks them "not applied" (chartSearchFieldReason).
        f.type !== "null" && FORWARDABLE_CHART_FILTER_COLUMNS.has(f.column),
    )
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
  if (ref.type === "metadata") return chartFilterExclusionReason("metadata");
  if (ref.type === "scores")
    return chartFilterExclusionReason(
      ref.level === "trace" ? "trace_scores_avg" : "scores_avg",
    );
  // `has:`/`-has:` presence checks lower to a null-check filter, which the chart
  // doesn't apply (dropped by toChartFilters) — so the pill is deactivated too.
  if (ref.type === "pseudo")
    return "Charts can't filter by whether a field is set at the moment — still applies to the table.";
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
    const reason = chartFilterExclusionReason(f.column);
    if (reason) excluded.set(f.column, reason);
  }
  return { forwarded: toChartFilters(filterState), excluded };
}
