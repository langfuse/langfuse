import {
  queryClickhouse,
  measureAndReturn,
  type ClickhouseQueryOpts,
  type PreferredClickhouseService,
} from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType, type ViewVersion } from "@/src/features/query/types";
import { getViewDeclaration } from "@/src/features/query/dataModel";
import { env } from "@/src/env.mjs";

// Re-export validation logic (shared between server and client)
export {
  validateQuery,
  type QueryValidationResult,
} from "@/src/features/query/validateQuery";

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

  const view = getViewDeclaration(query.view, version);
  const preferredClickhouseService = view.baseCte.includes("events_")
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

export async function executeQuery(
  projectId: string,
  query: QueryType,
  version: ViewVersion = "v1",
  enableSingleLevelOptimization: boolean = false,
): Promise<Array<Record<string, unknown>>> {
  const prepared = await prepareExecuteQuery({
    projectId,
    query,
    version,
    enableSingleLevelOptimization,
  });

  const chOpts = toClickhouseQueryOpts(prepared);

  if (!prepared.usesTraceTable) {
    return queryClickhouse<Record<string, unknown>>(chOpts);
  }

  return measureAndReturn({
    operationName: "executeQuery",
    projectId,
    input: {
      query: prepared.compiledQuery,
      params: prepared.parameters,
      fromTimestamp: prepared.fromTimestamp,
      tags: {
        ...prepared.tags,
        operation_name: "executeQuery",
      },
    },
    fn: async (input) => {
      return queryClickhouse<Record<string, unknown>>({
        ...chOpts,
        query: input.query,
        params: input.params,
        tags: input.tags,
      });
    },
  });
}
