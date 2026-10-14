import { type FilterState } from "@langfuse/shared";
import { type views } from "@langfuse/shared/query";
import { type z } from "zod";

/**
 * Translate a dashboard/widget query-view filter set into the best-possible
 * filter set for the traces / observations data table, so a "View as table"
 * action can open the row-level data behind a widget.
 *
 * This module is the single source of truth for the view -> table filter
 * direction. It is authored as a sibling of the table -> query-dimension
 * `classifyChartFilters` (chart-view/lib/chartFilterCompatibility.ts): same
 * `{ applicable, notApplicable }` shape with per-column reasons, but pointing
 * the opposite way, so the two are intentionally NOT shared.
 *
 * It is a pure module (no React, no server imports) so a later monitor-alert
 * feature can reuse it server-side.
 *
 * Input filters are expected in *view space* — i.e. their `column`s are the
 * canonical view dimension names the query engine uses (e.g. `providedModelName`,
 * `tags`, `sessionId`). Callers that hold widget/ui-table filters must first
 * normalize them via `mapWidgetUiTableFilterToView`.
 */

type ViewName = z.infer<typeof views>;

/** The data table a widget view opens into. */
export type TableTarget = "traces" | "observations";
export type TableVersion = "v3" | "v4";

type TableColumnMap = Readonly<Record<string, string | null>>;

export interface ClassifiedViewFilters {
  /**
   * Widget filters that the target table can express, rewritten so each
   * `column` carries the target table's column **id** (the value the table's
   * `?filter=` decoder matches against — see `getColumnName` in
   * useFilterState). Filter `type`/`operator`/`value` are preserved verbatim.
   */
  applicable: FilterState;
  /** Dropped view dimension -> human-readable reason it can't be expressed. */
  notApplicable: Map<string, string>;
}

/**
 * Which data table a widget view maps to. Mirrors `buildDataWindowPermalink`
 * in packages/shared/.../monitors/processor/processor.ts: an `observations`
 * view links to the observations table; `traces` and every `scores-*` view
 * link to the traces table (the row-level data users expect to inspect).
 */
export function tableTargetForView(view: ViewName): TableTarget {
  return view === "observations" ? "observations" : "traces";
}

/**
 * Per-view map from a canonical view dimension to the target data-table column
 * **id**. Only dimensions the target data table can genuinely express are
 * listed; every other dimension is reported as not-applicable. The
 * observations map is versioned because v3 and v4 expose different table
 * column ids and semantics.
 */
const V3_SCORE_VIEW_DIMENSION_TO_TABLE_COL: TableColumnMap = {
  traceName: "traceName",
  tags: "traceTags",
  userId: "userId",
  sessionId: "sessionId",
  traceRelease: "release",
  traceVersion: "version",
};

const VIEW_DIMENSION_TO_TABLE_COL_V3: Record<ViewName, TableColumnMap> = {
  // traces view -> traces table
  traces: {
    name: "traceName",
    tags: "traceTags",
    userId: "userId",
    sessionId: "sessionId",
    metadata: "metadata",
    release: "release",
    version: "version",
    environment: "environment",
    id: "id",
  },
  // observations view -> observations table
  observations: {
    traceName: "traceName",
    name: "name",
    userId: "userId",
    metadata: "metadata",
    type: "type",
    // Observations table keeps the `tags` id (it exposes trace tags as "Trace
    // Tags", id `tags`); traces table renames the same dimension to `traceTags`.
    tags: "tags",
    providedModelName: "model",
    level: "level",
    toolNames: "toolNames",
    calledToolNames: "calledToolNames",
    environment: "environment",
    version: "version",
    promptName: "promptName",
    promptVersion: "promptVersion",
    id: "id",
    traceId: "traceId",
    parentObservationId: "parentObservationId",
  },
  // Score views land on the traces table and can only preserve trace-derived
  // dimensions; score-owned dimensions are dropped.
  "scores-numeric": V3_SCORE_VIEW_DIMENSION_TO_TABLE_COL,
  "scores-boolean": V3_SCORE_VIEW_DIMENSION_TO_TABLE_COL,
  "scores-categorical": V3_SCORE_VIEW_DIMENSION_TO_TABLE_COL,
};

const V4_SCORE_VIEW_DIMENSION_TO_TABLE_COL: TableColumnMap = {
  ...V3_SCORE_VIEW_DIMENSION_TO_TABLE_COL,
  traceRelease: null,
};

// V4 routes are backed by EventsTable. Define only their differences from the
// legacy table mappings so compatibility decisions remain explicit.
const VIEW_DIMENSION_TO_TABLE_COL_V4: Record<ViewName, TableColumnMap> = {
  traces: {
    ...VIEW_DIMENSION_TO_TABLE_COL_V3.traces,
    id: "traceId",
    metadata: null,
    release: null,
  },
  observations: {
    ...VIEW_DIMENSION_TO_TABLE_COL_V3.observations,
    sessionId: "sessionId",
    tags: "traceTags",
    providedModelName: "providedModelName",
    traceVersion: "version",
    promptVersion: null,
    parentObservationId: null,
    isRootObservation: "isRootObservation",
    experimentName: "experimentName",
    experimentDatasetId: "experimentDatasetId",
    experimentId: "experimentId",
  },
  "scores-numeric": V4_SCORE_VIEW_DIMENSION_TO_TABLE_COL,
  "scores-boolean": V4_SCORE_VIEW_DIMENSION_TO_TABLE_COL,
  "scores-categorical": V4_SCORE_VIEW_DIMENSION_TO_TABLE_COL,
};

/**
 * Specific, human reasons for notable dropped dimensions. Any dimension not
 * covered here falls back to `defaultReason`.
 */
const SCORE_DROPPED_REASONS = {
  name: "Score name has no equivalent column on the traces table.",
  source: "Score source has no equivalent column on the traces table.",
  dataType: "Score data type has no equivalent column on the traces table.",
  metadata: "Score metadata does not map to trace metadata.",
  environment:
    "Score environment does not map to the trace environment column.",
  observationName:
    "Observation name has no equivalent column on the traces table.",
} as const;

const DROPPED_REASONS: Partial<
  Record<ViewName, Readonly<Record<string, string>>>
> = {
  traces: {
    timestampMonth:
      "Timestamp grouping has no filter column on the traces table.",
  },
  observations: {
    sessionId: "The observations table has no session filter column.",
    traceRelease:
      "Trace release is not a filterable column on the observations table.",
    traceVersion:
      "Trace version is not a filterable column on the observations table.",
    release:
      "Observation release is not a filterable column on the observations table.",
    startTimeMonth:
      "Timestamp grouping has no filter column on the observations table.",
    experimentName:
      "Experiment filters are not available on the observations table.",
    experimentId:
      "Experiment filters are not available on the observations table.",
    experimentDatasetId:
      "Experiment filters are not available on the observations table.",
    isRootObservation:
      "Semantic root status is only available on the v4 observations table.",
    promptVersion:
      "Prompt version uses a numeric events-table field and is not safely forwarded.",
  },
  "scores-numeric": {
    ...SCORE_DROPPED_REASONS,
    value: "Score value has no equivalent column on the traces table.",
  },
  "scores-boolean": {
    ...SCORE_DROPPED_REASONS,
    booleanValue: "Score value has no equivalent column on the traces table.",
  },
  "scores-categorical": {
    ...SCORE_DROPPED_REASONS,
    stringValue: "Score value has no equivalent column on the traces table.",
  },
};

const V4_SCORE_DROPPED_REASONS = {
  traceRelease: "Trace release is not available on the v4 events table.",
} as const;

const V4_DROPPED_REASONS: Partial<
  Record<ViewName, Readonly<Record<string, string>>>
> = {
  "scores-numeric": V4_SCORE_DROPPED_REASONS,
  "scores-boolean": V4_SCORE_DROPPED_REASONS,
  "scores-categorical": V4_SCORE_DROPPED_REASONS,
};

function reasonFor(
  view: ViewName,
  column: string,
  tableVersion: TableVersion,
): string {
  return (
    (tableVersion === "v4" ? V4_DROPPED_REASONS[view]?.[column] : undefined) ??
    DROPPED_REASONS[view]?.[column] ??
    `The "${column}" filter is not available on ${
      tableVersion === "v4"
        ? "the v4 events"
        : `the ${tableTargetForView(view)}`
    } table.`
  );
}

/**
 * Partition a view-space filter set into the filters the target data table can
 * express (rewritten to table column ids) and the dropped dimensions with a
 * reason each. Never throws: unknown columns degrade to not-applicable rather
 * than erroring, so navigation always proceeds.
 */
export function classifyViewFiltersForTable(
  view: ViewName,
  filters: FilterState,
  tableVersion: TableVersion = "v3",
): ClassifiedViewFilters {
  const columnMap =
    (tableVersion === "v4"
      ? VIEW_DIMENSION_TO_TABLE_COL_V4
      : VIEW_DIMENSION_TO_TABLE_COL_V3)[view] ?? {};
  const applicable: FilterState = [];
  const notApplicable = new Map<string, string>();

  for (const filter of filters) {
    const tableColId = columnMap[filter.column];
    if (tableColId) {
      applicable.push({ ...filter, column: tableColId });
    } else if (!notApplicable.has(filter.column)) {
      notApplicable.set(
        filter.column,
        reasonFor(view, filter.column, tableVersion),
      );
    }
  }

  return { applicable, notApplicable };
}
