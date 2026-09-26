import { recordIncrement } from "../instrumentation";
import { type NormalizedClickHouseQueryTags } from "./queryTags";
import { type ClickhouseServiceTarget } from "./client";

/**
 * Terminal outcome of one logical ClickHouse query, counted once per query
 * after retries are exhausted.
 *
 * Resource limits surface to public API callers as HTTP 422 and to tRPC
 * callers as UNPROCESSABLE_CONTENT, so status-code-derived signals cannot
 * distinguish them from a caller's malformed request. This metric is the
 * signal that can: it is emitted where the resource error is classified.
 */
export const CLICKHOUSE_QUERY_OUTCOME_METRIC =
  "langfuse.clickhouse.query.outcome";

export type ClickHouseQueryOutcome =
  | "success"
  | "timeout"
  | "memory_limit"
  | "overcommit"
  | "error";

/**
 * Maps `ClickHouseResourceError.errorType` onto outcomes. Keyed by the error
 * type literals rather than importing the type, so this module keeps no
 * dependency on the query paths that call it. Indexing it with `errorType`
 * makes the compiler reject a new error type that is not mapped here.
 */
export const CLICKHOUSE_RESOURCE_ERROR_OUTCOMES = {
  TIMEOUT: "timeout",
  MEMORY_LIMIT: "memory_limit",
  OVERCOMMIT: "overcommit",
} as const satisfies Record<string, ClickHouseQueryOutcome>;

/**
 * REST routes whose outcomes are reported under their own `route` tag.
 * Everything else is counted under `other`.
 *
 * `route` on the query tags is derived from the request path, so it carries
 * caller-controlled segments (trace ids, prompt names) and is unbounded. Metric
 * tags must be bounded, so only explicitly listed routes get a label. Add a
 * route here when it gains an SLO.
 */
const LABELLED_ROUTES = new Set([
  "GET /api/public/v2/observations",
  "GET /api/public/v2/metrics",
  "GET /api/public/v3/scores",
]);

/**
 * Non-REST routes matched verbatim: tRPC procedure paths (`events.all`) and MCP
 * tool names (`listObservations`) are code-defined and already bounded, so they
 * do not need the method/path parsing REST routes get. Add one when it gains an
 * SLO or drives a meaningful share of timeouts.
 */
const LABELLED_BARE_ROUTES = new Set([
  "events.all",
  "listObservations",
  "trace_redirect",
]);

const OTHER_ROUTE_LABEL = "other";

/**
 * Renders a route as a Datadog tag value, matching the `resource_name`
 * convention APM uses for the same route (`get_/api/public/v2/metrics`), so
 * SLO and dashboard queries can filter both signals the same way. Datadog tag
 * values cannot contain spaces, so the method is folded in with an underscore.
 */
export function clickHouseQueryOutcomeRouteLabel(route?: string): string {
  if (!route) return OTHER_ROUTE_LABEL;

  const collapsed = route.trim();
  const separatorIndex = collapsed.indexOf(" ");
  if (separatorIndex === -1) {
    return LABELLED_BARE_ROUTES.has(collapsed) ? collapsed : OTHER_ROUTE_LABEL;
  }

  const method = collapsed.slice(0, separatorIndex);
  const path = collapsed.slice(separatorIndex + 1);
  const normalizedPath =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  if (!LABELLED_ROUTES.has(`${method} ${normalizedPath}`)) {
    return OTHER_ROUTE_LABEL;
  }

  return `${method.toLowerCase()}_${normalizedPath}`;
}

/**
 * Bounded table label so timeouts can be isolated to the table under load — the
 * events read path (`events_full`/`events_core`) is the current driver, and the
 * counter is blind to it without this tag.
 */
export type ClickHouseQueryTable =
  | "events_full"
  | "events_core"
  | "traces"
  | "observations"
  | "scores"
  | "dataset_run_items"
  | "blob_storage_file_log"
  | "other";

/**
 * Derived from the query text because threading a table through every call site
 * is impractical. Anchored to the `FROM` table (with an optional `db.` prefix)
 * so a lightweight join partner never outranks the table under load — the Scores
 * UI reads `FROM scores ... LEFT JOIN traces`, and a bare `traces` scan would
 * otherwise steal the label. Still best-effort: a subquery/CTE reading a
 * different table in its own `FROM` can win by priority order (first match
 * wins). The events read path is single-table (`FROM events_full`/`events_core`,
 * no v3 joins), so those labels are reliable.
 */
const TABLE_LABEL_PATTERNS: ReadonlyArray<[ClickHouseQueryTable, RegExp]> = [
  ["events_full", /\bfrom\s+(?:\w+\.)?events_full\b/i],
  ["events_core", /\bfrom\s+(?:\w+\.)?events_core\b/i],
  ["observations", /\bfrom\s+(?:\w+\.)?observations\b/i],
  ["traces", /\bfrom\s+(?:\w+\.)?traces\b/i],
  ["scores", /\bfrom\s+(?:\w+\.)?scores\b/i],
  ["dataset_run_items", /\bfrom\s+(?:\w+\.)?dataset_run_items_rmt\b/i],
  ["blob_storage_file_log", /\bfrom\s+(?:\w+\.)?blob_storage_file_log\b/i],
];

const OTHER_TABLE_LABEL = "other" as const;

export function clickHouseQueryTableLabel(query: string): ClickHouseQueryTable {
  for (const [label, pattern] of TABLE_LABEL_PATTERNS) {
    if (pattern.test(query)) return label;
  }
  return OTHER_TABLE_LABEL;
}

/**
 * Bounded filter-shape label so a timeout can be attributed to the predicate
 * shape driving it, not just the table. Without it, one `events_full` timeout
 * cannot be told from another on the metric, and per-shape rates have to be
 * estimated from ~10%-sampled APM query text. This makes the shape a
 * first-class, unsampled dimension on both the outcome metric and the query
 * span.
 *
 * One value per query: the shapes are ranked by how strongly each drives scan
 * cost, and the first match wins, so it adds a single bounded dimension rather
 * than a boolean per shape. A query carrying several predicates (e.g. a
 * by-`span_id` lookup that also bounds `trace_id`) is attributed to its
 * highest-ranked shape.
 */
export type ClickHouseQueryShape =
  | "io_content"
  | "metadata_content"
  | "id_or_ilike"
  | "by_span_id"
  | "by_trace_id"
  | "other";

const OTHER_SHAPE_LABEL = "other" as const;

/**
 * Derived from the query text (like the table label) because threading the
 * filter shape through every call site is impractical. Patterns match the SQL
 * the filter compilers emit:
 *
 * - `io_content`: a substring/token/prefix/(I)LIKE search over the `input`/
 *   `output` columns — the largest `events_full` columns and the confirmed
 *   full-scan class. Anchored to `input`/`output` so a metadata search never
 *   counts.
 * - `metadata_content`: the same search family over the `metadata_names`/
 *   `metadata_values` arrays, distinguished by the array-column suffix and the
 *   `has(names, key)` / `indexOf(names, key)` key-lookup wrapper. Only filter
 *   functions are matched (`has`/`position`/`hasAllTokens`/`startsWith`/…), not
 *   the `mapFromArrays`/`argMax`/`arrayReverse` projection helpers.
 * - `id_or_ilike`: the OR-of-`ILIKE` id search arm, matched on its distinctive
 *   `searchString` parameter.
 * - `by_span_id`: a `span_id = {…}` point lookup (`getObservationById`) or a
 *   `span_id IN {…}` batch lookup. Ranked above `by_trace_id` so a span lookup
 *   that also bounds `trace_id` counts as the span lookup.
 * - `by_trace_id`: a `trace_id IN (…)` / `trace_id IN {…}` / `trace_id = {…}`
 *   lookup — the unbounded variant is a distinct timeout class. The `IN` form
 *   appears both parenthesized (inline list) and bare (`{param: Array(...)}`).
 */
const IO_CONTENT_FUNCTION_PATTERN =
  /\b(?:position(?:caseinsensitive)?|hasalltokens|hasanytokens|hastoken|startswith|endswith)\s*\(\s*(?:lower\s*\(\s*)?(?:\w+\.)?(?:input|output)\b/i;

const IO_CONTENT_LIKE_PATTERN =
  /\b(?:\w+\.)?(?:input|output)\s+(?:not\s+)?i?like\b/i;

const METADATA_CONTENT_PATTERN =
  /\b(?:has|position(?:caseinsensitive)?|hasalltokens|hasanytokens|hastoken|startswith|endswith)\s*\(\s*(?:lower\s*\(\s*)?(?:\w+\.)?metadata_(?:names|values)\b/i;

const ID_OR_ILIKE_PATTERN = /\bilike\s*\{\s*searchString\b/i;

const BY_SPAN_ID_PATTERN = /\bspan_id\s*=\s*\{|\bspan_id\s+in\s*(?:\(\s*)?\{/i;

const BY_TRACE_ID_PATTERN =
  /\btrace_id\s*=\s*\{|\btrace_id\s+in\s*(?:\(\s*)?\{/i;

const QUERY_SHAPE_PATTERNS: ReadonlyArray<[ClickHouseQueryShape, RegExp]> = [
  ["io_content", IO_CONTENT_FUNCTION_PATTERN],
  ["io_content", IO_CONTENT_LIKE_PATTERN],
  ["metadata_content", METADATA_CONTENT_PATTERN],
  ["id_or_ilike", ID_OR_ILIKE_PATTERN],
  ["by_span_id", BY_SPAN_ID_PATTERN],
  ["by_trace_id", BY_TRACE_ID_PATTERN],
];

export function clickHouseQueryShape(query: string): ClickHouseQueryShape {
  for (const [shape, pattern] of QUERY_SHAPE_PATTERNS) {
    if (pattern.test(query)) return shape;
  }
  return OTHER_SHAPE_LABEL;
}

/**
 * Where the query ran, so load on the writer can be split into reads that must
 * stay there (`readAfterWrite`) and reads that could move to a replica.
 */
export type ClickHouseQueryTarget = {
  service: ClickhouseServiceTarget;
  readAfterWrite: boolean;
};

export function recordClickHouseQueryOutcome(
  outcome: ClickHouseQueryOutcome,
  tags: NormalizedClickHouseQueryTags,
  table: ClickHouseQueryTable,
  shape: ClickHouseQueryShape,
  target: ClickHouseQueryTarget,
): void {
  recordIncrement(CLICKHOUSE_QUERY_OUTCOME_METRIC, 1, {
    outcome,
    surface: tags.surface,
    route: clickHouseQueryOutcomeRouteLabel(tags.route),
    table,
    query_shape: shape,
    clickhouse_service: target.service,
    read_after_write: String(target.readAfterWrite),
  });
}
