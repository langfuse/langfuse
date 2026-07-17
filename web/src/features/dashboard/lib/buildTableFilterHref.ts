import { type FilterState } from "@langfuse/shared";
import { type views } from "@langfuse/shared/query";
import { type z } from "zod";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import {
  classifyViewFiltersForTable,
  tableTargetForView,
} from "@/src/features/dashboard/lib/viewFilterToTableFilter";
import {
  encodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "@/src/features/filters/lib/filter-query-encoding";
import { rangeToString } from "@/src/utils/date-range-utils";

type ViewName = z.infer<typeof views>;

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

  return { encoded, droppedForLength };
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
 */
export function buildTableFilterHref(
  projectId: string,
  view: ViewName,
  filters: FilterState,
  dateRange: { from: Date; to: Date } | undefined,
): TableFilterHrefResult {
  const table = tableTargetForView(view);

  const viewFilters = mapLegacyUiTableFilterToView(view, filters);
  const { applicable, notApplicable } = classifyViewFiltersForTable(
    view,
    viewFilters,
  );

  const { encoded, droppedForLength } = encodeFiltersWithinBudget(applicable);

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

  return { href, notApplicable, droppedForLength };
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
