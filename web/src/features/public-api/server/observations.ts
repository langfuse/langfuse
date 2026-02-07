import {
  createPublicApiObservationsColumnMapping,
  deriveFilters,
  StringFilter,
  type ObservationRecordReadType,
  queryClickhouse,
  measureAndReturn,
  observationsTableUiColumnDefinitions,
  convertObservation,
  shouldSkipObservationsFinal,
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

  // ClickHouse query optimizations for List Observations API
  const disableObservationsFinal = await shouldSkipObservationsFinal(
    props.projectId,
  );

  const query = `
    with clickhouse_keys as (
      SELECT DISTINCT
        id,
        trace_id,
        project_id,
        type,
        toDate(start_time)
      FROM observations o
        ${traceFilter ? `LEFT JOIN __TRACE_TABLE__ t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
      WHERE o.project_id = {projectId: String}
        ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
        AND ${appliedFilter.query}
      ORDER BY start_time DESC
        ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
    )
    SELECT
      id,
      trace_id,
      project_id,
      type,
      parent_observation_id,
      environment,
      start_time,
      end_time,
      name,
      metadata,
      level,
      status_message,
      version,
      input,
      output,
      provided_model_name,
      internal_model_id,
      model_parameters,
      provided_usage_details,
      usage_details,
      provided_cost_details,
      cost_details,
      total_cost,
      completion_start_time,
      prompt_id,
      prompt_name,
      prompt_version,
      created_at,
      updated_at,
      event_ts
    FROM observations o ${disableObservationsFinal ? "" : "FINAL"}
    WHERE o.project_id = {projectId: String}
      AND (id, trace_id, project_id, type, toDate(start_time)) in (select * from clickhouse_keys)
    ORDER BY start_time DESC
  `;

  return measureAndReturn({
    operationName: "generateObservationsForPublicApi",
    projectId: props.projectId,
    input: {
      params: {
        ...appliedFilter.params,
        projectId: props.projectId,
        ...(props.limit !== undefined ? { limit: props.limit } : {}),
        ...(props.page !== undefined
          ? { offset: (props.page - 1) * props.limit }
          : {}),
      },
      tags: {
        feature: "tracing",
        type: "observation",
        projectId: props.projectId,
        operation_name: "generateObservationsForPublicApi",
      },
    },
    fn: async (input) => {
      const result = await queryClickhouse<ObservationRecordReadType>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
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
    SELECT count() as count
    FROM observations o
    ${traceFilter ? `LEFT JOIN __TRACE_TABLE__ t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
    WHERE o.project_id = {projectId: String}
    ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
    AND ${filter.query}
  `;

  return measureAndReturn({
    operationName: "getObservationsCountForPublicApi",
    projectId: props.projectId,
    input: {
      params: { ...filter.params, projectId: props.projectId },
      tags: {
        feature: "tracing",
        type: "observation",
        projectId: props.projectId,
        operation_name: "getObservationsCountForPublicApi",
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<{ count: string }>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
      return records.map((record) => Number(record.count)).shift();
    },
  });
};

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

  // Remove score filters since observations don't support scores in response
  const filteredChFilter = chFilter.filter(
    (f) => f.clickhouseTable !== "scores",
  );

  // Add project filter
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
