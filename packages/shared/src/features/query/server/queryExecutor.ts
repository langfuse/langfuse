import { type ClickhouseQueryOpts } from "../../../server/repositories/clickhouse";
import { type PreferredClickhouseService } from "../../../server/clickhouse/client";
import { QueryBuilder } from "./queryBuilder";
import { type QueryType, type ViewVersion } from "../types";
import { env } from "../../../env";
import { executeGreptimeQuery } from "./greptimeQueryExecutor";

export type PreparedQuery = {
  compiledQuery: string;
  parameters: Record<string, unknown>;
  preferredClickhouseService: PreferredClickhouseService | undefined;
  tags: Record<string, string>;
  clickhouseSettings: Record<string, string>;
  usesTraceTable: boolean;
  fromTimestamp: string;
};

export async function prepareExecuteQuery(opts: {
  projectId: string;
  query: QueryType;
  version?: ViewVersion;
  enableSingleLevelOptimization?: boolean;
}): Promise<PreparedQuery> {
  const {
    projectId,
    query,
    version = "v1",
    enableSingleLevelOptimization = false,
  } = opts;

  const chartConfig =
    (query as unknown as { config?: QueryType["chartConfig"] }).config ??
    query.chartConfig;
  const queryBuilder = new QueryBuilder(chartConfig, version);

  const { query: compiledQuery, parameters } = await queryBuilder.build(
    query,
    projectId,
    enableSingleLevelOptimization ||
      env.LANGFUSE_ENABLE_SINGLE_LEVEL_QUERY_OPTIMIZATION === "true",
  );

  // v2 score views are score-based, but can add events_core joins for
  // trace/observation dimensions. Route based on the compiled query so only
  // generated queries that actually touch events use the events readonly pool.
  const usesEventsTable =
    compiledQuery.includes("events_core") ||
    compiledQuery.includes("events_full");
  const preferredClickhouseService = usesEventsTable
    ? ("EventsReadOnly" as const)
    : undefined;

  const tags = {
    feature: "custom-queries",
    type: query.view,
    kind: "analytic",
    projectId,
  };

  const clickhouseSettings: Record<string, string> = {
    date_time_output_format: "iso",
    ...(env.CLICKHOUSE_USE_QUERY_CONDITION_CACHE === "true"
      ? { use_query_condition_cache: "true" }
      : {}),
    max_bytes_before_external_group_by: String(
      env.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY,
    ),
  };

  return {
    compiledQuery,
    parameters,
    preferredClickhouseService,
    tags,
    clickhouseSettings,
    usesTraceTable: compiledQuery.includes("traces"),
    fromTimestamp: query.fromTimestamp,
  };
}

export function toClickhouseQueryOpts(
  prepared: PreparedQuery,
): Omit<ClickhouseQueryOpts, "allowLegacyEventsRead"> {
  return {
    query: prepared.compiledQuery,
    params: prepared.parameters,
    clickhouseSettings: prepared.clickhouseSettings,
    tags: prepared.tags,
    preferredClickhouseService: prepared.preferredClickhouseService,
  };
}

/**
 * Dashboard widget query entry point. Hard-swapped to the GreptimeDB engine (04-read-path.md, P3):
 * the ClickHouse `QueryBuilder` + `dataModel` (still used by `prepareExecuteQuery` for the streaming
 * route until P7) are bypassed; both CH v1 and v2 widget queries collapse onto the merged GreptimeDB
 * projection via `executeGreptimeQuery`. `version` and `enableSingleLevelOptimization` are retained
 * for call-site compatibility and ignored (GreptimeDB collapses the versions and two-levels only when
 * a relation measure requires it).
 */
export async function executeQuery(
  projectId: string,
  query: QueryType,
  _version: ViewVersion = "v1",
  _enableSingleLevelOptimization: boolean = false,
): Promise<Array<Record<string, unknown>>> {
  return executeGreptimeQuery(projectId, query);
}
