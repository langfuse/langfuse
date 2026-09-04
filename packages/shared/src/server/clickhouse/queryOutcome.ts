import { recordIncrement } from "../instrumentation";
import { type NormalizedClickHouseQueryTags } from "./queryTags";

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
const LABELLED_BARE_ROUTES = new Set(["events.all", "listObservations"]);

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
  | "other";

/**
 * Derived from the query text because threading a table through every call site
 * is impractical. The events tables are checked first and never co-occur with
 * the v3 tables, so `events_full`/`events_core` are exact; the v3 labels are
 * best-effort for multi-table joins (the first match in this order wins).
 */
const TABLE_LABEL_PATTERNS: ReadonlyArray<[ClickHouseQueryTable, RegExp]> = [
  ["events_full", /\bevents_full\b/i],
  ["events_core", /\bevents_core\b/i],
  ["observations", /\bobservations\b/i],
  ["traces", /\btraces\b/i],
  ["scores", /\bscores\b/i],
];

const OTHER_TABLE_LABEL = "other" as const;

export function clickHouseQueryTableLabel(query: string): ClickHouseQueryTable {
  for (const [label, pattern] of TABLE_LABEL_PATTERNS) {
    if (pattern.test(query)) return label;
  }
  return OTHER_TABLE_LABEL;
}

export function recordClickHouseQueryOutcome(
  outcome: ClickHouseQueryOutcome,
  tags: NormalizedClickHouseQueryTags,
  table: ClickHouseQueryTable,
): void {
  recordIncrement(CLICKHOUSE_QUERY_OUTCOME_METRIC, 1, {
    outcome,
    surface: tags.surface,
    route: clickHouseQueryOutcomeRouteLabel(tags.route),
    table,
  });
}
