import { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";
import { traceFilterConfig } from "@/src/features/filters/config/traces-config";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

/**
 * The Users list is the traces/events population grouped by `user_id`, so its
 * sidebar is the Traces sidebar: same facets, same labels, same lowering. The
 * facet sets below are therefore derived from the trace and observation
 * configs rather than restated, so a facet added there reaches Users too.
 *
 * What Users cannot inherit is anything that needs a join. Both read paths
 * scan a single table — v3 `from traces t`, v4 `from events_core e` — with no
 * observation, score, or comment join. A score facet lowers to an `s.` alias
 * that does not exist and fails in ClickHouse; the comment facets fail earlier,
 * in `createFilterFromFilterState`, though for different reasons per path (v3
 * has no `commentCount` mapping at all, v4 maps it to a `comments` table the
 * filter factory refuses to lower against this query). Those are excluded per
 * path below.
 *
 * `users-facet-coverage.servertest.ts` runs every facet declared here through
 * the real query, so a newly inherited facet that needs a join fails there
 * rather than in a user's browser.
 */

/**
 * v3 filters `traces t` alone. Only trace-table columns resolve: the trace
 * config's `level`, `latency`, token and cost facets all map to an
 * `observations` alias the users query never joins.
 */
const TRACE_FACET_COLUMNS_UNAVAILABLE_ON_USERS = new Set([
  "level",
  "latency",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "inputCost",
  "outputCost",
  "totalCost",
  "scores_avg",
  "score_categories",
  "score_booleans",
  "commentCount",
  "commentContent",
]);

/**
 * v4 filters `events_core e` alone. Every native event column resolves —
 * including the `level`, `latency`, token and cost columns v3 has to drop —
 * so only the score aggregates (an `s.` join) and the comment facets (which
 * lower against the `comments` table this query never reaches) fall out.
 */
const EVENT_FACET_COLUMNS_UNAVAILABLE_ON_USERS = new Set([
  "scores_avg",
  "score_categories",
  "score_booleans",
  "commentCount",
  "commentContent",
]);

function withoutFacets(config: FilterConfig, omitted: ReadonlySet<string>) {
  return config.facets.filter((facet) => !omitted.has(facet.column));
}

export const usersFilterConfig: FilterConfig = {
  // v3 and v4 expose different facet sets, so they persist under different
  // table names. Sharing one would let a v4-only filter (`level`) rehydrate on
  // a v3 project, where it is a 400 rather than a narrowed table.
  tableName: "users",
  columnDefinitions: traceFilterConfig.columnDefinitions,
  defaultExpanded: ["environment", "traceName"],
  facets: withoutFacets(
    traceFilterConfig,
    TRACE_FACET_COLUMNS_UNAVAILABLE_ON_USERS,
  ),
};

export const usersEventsFilterConfig: FilterConfig = {
  tableName: "users-events",
  columnDefinitions: observationEventsFilterConfig.columnDefinitions,
  defaultExpanded: ["environment", "name"],
  migrateFilterState: observationEventsFilterConfig.migrateFilterState,
  facets: withoutFacets(
    observationEventsFilterConfig,
    EVENT_FACET_COLUMNS_UNAVAILABLE_ON_USERS,
  ),
};

export function getUsersFilterConfig(fromEvents: boolean): FilterConfig {
  return fromEvents ? usersEventsFilterConfig : usersFilterConfig;
}
