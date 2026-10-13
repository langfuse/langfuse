import { ClickHouseError, parseError } from "@clickhouse/client";
import { recordDistribution, recordIncrement } from "../instrumentation";
import { type NormalizedClickHouseQueryTags } from "./queryTags";
import { type ClickhouseService } from "./client";

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

/**
 * Per-query runtime distribution, read from the `x-clickhouse-summary` response
 * header and emitted unsampled with the outcome metric's tags. APM keeps only a
 * small sample of query spans, so this is the series to track query runtime
 * over time per route, table, shape and ClickHouse service.
 */
export const CLICKHOUSE_QUERY_ELAPSED_MS_METRIC =
  "langfuse.clickhouse.query.elapsed_ms";

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
 * Metric tags must be bounded, so a route only gets its own label when its
 * value set is fixed by code:
 *
 * - Bare routes (`events.all`, `listObservations`, `langfuse.queue.trace_delete`)
 *   are tRPC procedure paths, MCP tool names and worker routes. Each is set only
 *   after the procedure, tool or queue resolved, so they pass through.
 * - REST routes carry their page template (`GET /api/public/traces/[traceId]`),
 *   taken from a list of the dynamic API routes in web. As a guard against a
 *   route missing from that list, a segment that is neither a word, a version
 *   (`v2`) nor a `[param]` placeholder drops the route to `other`.
 */
const BARE_ROUTE_PATTERN = /^[A-Za-z][\w.]{0,99}$/;
const REST_PATH_PREFIX = "/api/";
const REST_STATIC_SEGMENT_PATTERN = /^(?:[A-Za-z][A-Za-z_-]*|v\d+|\[\w+\])$/;
const MAX_REST_SEGMENTS = 10;

const OTHER_ROUTE_LABEL = "other";

/**
 * Renders a route as a Datadog tag value, matching the `resource_name`
 * convention APM uses for the same route (`get_/api/public/v2/metrics`), so
 * SLO and dashboard queries can filter both signals the same way. Datadog tag
 * values cannot contain spaces or brackets, so the method is folded in with an
 * underscore and a `[param]` placeholder is rendered as `_param_`.
 */
export function clickHouseQueryOutcomeRouteLabel(route?: string): string {
  if (!route) return OTHER_ROUTE_LABEL;

  const collapsed = route.trim();
  const separatorIndex = collapsed.indexOf(" ");
  if (separatorIndex === -1) {
    return BARE_ROUTE_PATTERN.test(collapsed) ? collapsed : OTHER_ROUTE_LABEL;
  }

  const method = collapsed.slice(0, separatorIndex);
  const path = collapsed.slice(separatorIndex + 1);
  const normalizedPath =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (!/^[A-Z]+$/.test(method) || !normalizedPath.startsWith(REST_PATH_PREFIX))
    return OTHER_ROUTE_LABEL;

  const segments = normalizedPath.slice(1).split("/");
  if (
    segments.length > MAX_REST_SEGMENTS ||
    !segments.every((segment) => REST_STATIC_SEGMENT_PATTERN.test(segment))
  ) {
    return OTHER_ROUTE_LABEL;
  }

  return `${method.toLowerCase()}_${normalizedPath.replace(/\[(\w+)\]/g, "_$1_")}`;
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
 * no v3 joins), so those labels are reliable. `dataset_run_items` ranks above
 * `scores` because dataset run tables filtered by a score read scores in a CTE.
 */
const TABLE_LABEL_PATTERNS: ReadonlyArray<[ClickHouseQueryTable, RegExp]> = [
  ["events_full", /\bfrom\s+(?:\w+\.)?events_full\b/i],
  ["events_core", /\bfrom\s+(?:\w+\.)?events_core\b/i],
  ["observations", /\bfrom\s+(?:\w+\.)?observations\b/i],
  ["traces", /\bfrom\s+(?:\w+\.)?traces\b/i],
  ["dataset_run_items", /\bfrom\s+(?:\w+\.)?dataset_run_items_rmt\b/i],
  ["scores", /\bfrom\s+(?:\w+\.)?scores\b/i],
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
 *
 * Scores reads get their own shapes for the dedup strategy, which decides their
 * cost more than the filter predicate does. They rank first, but only when the
 * query's table label is `scores`.
 */
export type ClickHouseQueryShape =
  | "scores_final"
  | "scores_join_seek"
  | "scores_join"
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

/**
 * Scores dedup strategies, matching the SQL the scores UI read emits:
 *
 * - `scores_final`: `FROM scores [s] FINAL`.
 * - `scores_join_seek`: rows joined back to each key's `max(event_ts)`, with
 *   the key set narrowed first by a `SELECT DISTINCT` seek.
 * - `scores_join`: the same join without the seek.
 */
const SCORES_FINAL_PATTERN =
  /\bfrom\s+(?:\w+\.)?scores\s+(?:(?:as\s+)?\w+\s+)?final\b/i;

const SCORES_LATEST_JOIN_PATTERN =
  /\bmax\s*\(\s*(?:\w+\.)?event_ts\s*\)\s+as\s+latest_event_ts\b/i;

const SELECT_DISTINCT_PATTERN = /\bselect\s+distinct\b/i;

function scoresQueryShape(query: string): ClickHouseQueryShape | undefined {
  if (SCORES_FINAL_PATTERN.test(query)) return "scores_final";
  if (SCORES_LATEST_JOIN_PATTERN.test(query)) {
    return SELECT_DISTINCT_PATTERN.test(query)
      ? "scores_join_seek"
      : "scores_join";
  }
  return undefined;
}

export function clickHouseQueryShape(
  query: string,
  table: ClickHouseQueryTable = clickHouseQueryTableLabel(query),
): ClickHouseQueryShape {
  if (table === "scores") {
    const scoresShape = scoresQueryShape(query);
    if (scoresShape) return scoresShape;
  }
  for (const [shape, pattern] of QUERY_SHAPE_PATTERNS) {
    if (pattern.test(query)) return shape;
  }
  return OTHER_SHAPE_LABEL;
}

function clickHouseQueryMetricTags(
  tags: NormalizedClickHouseQueryTags,
  table: ClickHouseQueryTable,
  shape: ClickHouseQueryShape,
  clickhouseService: ClickhouseService,
) {
  return {
    surface: tags.surface,
    route: clickHouseQueryOutcomeRouteLabel(tags.route),
    table,
    query_shape: shape,
    clickhouse_service: clickhouseService,
  };
}

/**
 * Transport failures the query path retries. Shared with the retry predicate so
 * an exhausted retry is labelled `network` on the outcome metric.
 */
export const CLICKHOUSE_NETWORK_ERROR_PATTERNS = [
  "socket hang up",
  "broken pipe",
  "connection reset",
  "econnreset",
  "network_error",
  "etimedout",
  "econnrefused",
] as const;

/**
 * ClickHouse error codes that get their own `error_code` label, keyed by the
 * numeric code. Together they cover >99.9% of failed Langfuse reads; the rest is
 * a long tail reported as `other` and recoverable from `system.query_log`.
 * Matching on the number rather than the name keeps the label set closed: the
 * name is parsed from the message text, which can echo caller input.
 */
const LABELLED_CLICKHOUSE_ERROR_CODES: Record<string, string> = {
  "60": "unknown_table",
  "159": "timeout_exceeded",
  "202": "too_many_simultaneous_queries",
  "209": "socket_timeout",
  "210": "network_error",
  "241": "memory_limit_exceeded",
  "734": "cannot_write_after_buffer_canceled",
  "735": "query_was_cancelled_by_client",
};

const OTHER_ERROR_CODE_LABEL = "other";

/**
 * Bounded cause of a failed query, so `error` outcomes are not opaque and a
 * server-side `TIMEOUT_EXCEEDED` can be told from a client request timeout.
 *
 * - A labelled ClickHouse error code (`timeout_exceeded`, `unknown_table`, …),
 *   from a thrown `ClickHouseError` or an exception row's `Code: N.` prefix.
 *   Any other ClickHouse code is `other`.
 * - `network` for a transport failure that outlived the retries.
 * - `client_timeout` for the client's own request timeout, which carries no
 *   ClickHouse code.
 * - `other` for anything else.
 */
export function clickHouseQueryErrorCode(error: unknown): string {
  const root =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : error;
  if (!(root instanceof Error)) return OTHER_ERROR_CODE_LABEL;

  const parsed = root instanceof ClickHouseError ? root : parseError(root);
  if (parsed instanceof ClickHouseError) {
    return (
      LABELLED_CLICKHOUSE_ERROR_CODES[parsed.code] ?? OTHER_ERROR_CODE_LABEL
    );
  }

  const message = (root.message ?? "").toLowerCase();
  if (CLICKHOUSE_NETWORK_ERROR_PATTERNS.some((p) => message.includes(p))) {
    return "network";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "client_timeout";
  }
  return OTHER_ERROR_CODE_LABEL;
}

/**
 * `error` is the thrown error for a failed query and omitted on success, where
 * `error_code` is `none`.
 */
export function recordClickHouseQueryOutcome(
  outcome: ClickHouseQueryOutcome,
  tags: NormalizedClickHouseQueryTags,
  table: ClickHouseQueryTable,
  shape: ClickHouseQueryShape,
  clickhouseService: ClickhouseService,
  error?: unknown,
): void {
  recordIncrement(CLICKHOUSE_QUERY_OUTCOME_METRIC, 1, {
    outcome,
    error_code:
      outcome === "success" ? "none" : clickHouseQueryErrorCode(error),
    ...clickHouseQueryMetricTags(tags, table, shape, clickhouseService),
  });
}

/**
 * Emits the runtime distribution from a parsed `x-clickhouse-summary` header.
 * ClickHouse sends `elapsed_ns` as a numeric string; an older server that does
 * not send it emits nothing.
 */
export function recordClickHouseQueryElapsed(
  summary: Record<string, unknown>,
  tags: NormalizedClickHouseQueryTags,
  table: ClickHouseQueryTable,
  shape: ClickHouseQueryShape,
  clickhouseService: ClickhouseService,
): void {
  if (summary.elapsed_ns === undefined) return;
  const elapsedNs = Number(summary.elapsed_ns);
  if (!Number.isFinite(elapsedNs)) return;
  recordDistribution(
    CLICKHOUSE_QUERY_ELAPSED_MS_METRIC,
    elapsedNs / 1e6,
    clickHouseQueryMetricTags(tags, table, shape, clickhouseService),
  );
}
