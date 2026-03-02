import {
  createPublicApiObservationsColumnMapping,
  deriveFilters,
  StringFilter,
  type ObservationRecordReadType,
  measureAndReturn,
  observationsTableUiColumnDefinitions,
  convertObservation,
  DatabaseAdapterFactory,
  convertFilterParamsToPositional,
} from "@langfuse/shared/src/server";
import type { FilterState } from "@langfuse/shared";

type QueryType = {
  page: number;
  limit: number;
  projectId: string;
  traceId?: string;
  userId?: string;
  name?: string;
  type?: string;
  parentObservationId?: string;
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
  advancedFilters?: FilterState;
};

export const generateObservationsForPublicApi = async (props: QueryType) => {
  const chFilter = generateFilter(props);
  const appliedFilter = chFilter.apply();
  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  // OceanBase: use ROW_NUMBER() for dedup instead of FINAL
  const query = `
    WITH ranked_obs AS (
      SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.event_ts DESC) as rn
      FROM observations o
      ${traceFilter ? `LEFT JOIN traces t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
      WHERE o.project_id = {projectId: String}
        ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
        AND ${appliedFilter.query}
    ),
    obs_keys AS (
      SELECT DISTINCT id, trace_id, project_id, type, DATE(start_time) as dt
      FROM ranked_obs
      WHERE rn = 1
      ORDER BY start_time DESC
      ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
    )
    SELECT
      o.id, o.trace_id, o.project_id, o.type, o.parent_observation_id, o.environment,
      o.start_time, o.end_time, o.name, o.metadata, o.level, o.status_message, o.version,
      o.input, o.output, o.provided_model_name, o.internal_model_id, o.model_parameters,
      o.provided_usage_details, o.usage_details, o.provided_cost_details, o.cost_details,
      o.total_cost, o.completion_start_time, o.prompt_id, o.prompt_name, o.prompt_version,
      o.created_at, o.updated_at, o.event_ts
    FROM ranked_obs o
    WHERE o.rn = 1
      AND o.project_id = {projectId: String}
      AND (o.id, o.trace_id, o.project_id, o.type, DATE(o.start_time)) IN (SELECT id, trace_id, project_id, type, dt FROM obs_keys)
    ORDER BY o.start_time DESC
  `;

  const params = {
    ...appliedFilter.params,
    projectId: props.projectId,
    ...(props.limit !== undefined ? { limit: props.limit } : {}),
    ...(props.page !== undefined
      ? { offset: (props.page - 1) * props.limit }
      : {}),
  };
  const { query: obQuery, params: obParams } = convertFilterParamsToPositional(
    query.trim(),
    params,
  );

  return measureAndReturn({
    operationName: "generateObservationsForPublicApi",
    projectId: props.projectId,
    input: {
      obQuery,
      obParams,
      tags: buildTags(props.projectId, "generateObservationsForPublicApi"),
    },
    fn: async (inp) => {
      const adapter = DatabaseAdapterFactory.getInstance();
      const result = await adapter.queryWithOptions<ObservationRecordReadType>({
        query: inp.obQuery,
        params: inp.obParams,
        tags: inp.tags,
      });
      return result.map((r) => convertObservation(r));
    },
  });
};

export const getObservationsCountForPublicApi = async (props: QueryType) => {
  const chFilter = generateFilter(props);
  const filter = chFilter.apply();
  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    SELECT COUNT(*) as count
    FROM observations o
    ${traceFilter ? `LEFT JOIN traces t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
    WHERE o.project_id = {projectId: String}
    ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
    AND ${filter.query}
  `;

  const params = { ...filter.params, projectId: props.projectId };
  const { query: obQuery, params: obParams } = convertFilterParamsToPositional(
    query.trim(),
    params,
  );

  return measureAndReturn({
    operationName: "getObservationsCountForPublicApi",
    projectId: props.projectId,
    input: {
      obQuery,
      obParams,
      tags: buildTags(props.projectId, "getObservationsCountForPublicApi"),
    },
    fn: async (inp) => {
      const adapter = DatabaseAdapterFactory.getInstance();
      const records = await adapter.queryWithOptions<{ count: string }>({
        query: inp.obQuery,
        params: inp.obParams,
        tags: inp.tags,
      });
      return records.map((record) => Number(record.count)).shift();
    },
  });
};

function buildTags(
  projectId: string,
  operation_name: string,
): Record<string, string> {
  return {
    feature: "tracing",
    type: "observation",
    projectId,
    operation_name,
  };
}

const filterParams = createPublicApiObservationsColumnMapping(
  "observations",
  "o",
  "parent_observation_id",
);

const generateFilter = (query: QueryType) => {
  const { advancedFilters, ...simpleFilterProps } = query;
  const chFilter = deriveFilters(
    simpleFilterProps,
    filterParams,
    advancedFilters,
    observationsTableUiColumnDefinitions.filter(
      (c) => c.clickhouseTableName !== "scores",
    ),
  );

  const filteredChFilter = chFilter.filter(
    (f) => f.clickhouseTable !== "scores",
  );

  filteredChFilter.push(
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: query.projectId,
    }),
  );
  return filteredChFilter;
};
