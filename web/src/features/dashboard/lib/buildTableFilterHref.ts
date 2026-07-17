import { type FilterState } from "@langfuse/shared";
import { type views } from "@langfuse/shared/query";
import { type z } from "zod";
import { mapWidgetUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
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
 */
export function buildTableFilterHref(
  projectId: string,
  view: ViewName,
  filters: FilterState,
  dateRange: { from: Date; to: Date } | undefined,
): TableFilterHrefResult {
  const table = tableTargetForView(view);

  const viewFilters = mapWidgetUiTableFilterToView(view, filters);
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
