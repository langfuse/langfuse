import { convertApiProvidedFilterToClickhouseFilter } from "@/src/features/public-api/server/filter-builder";
import {
  StringFilter,
  type ObservationRecordReadType,
  queryClickhouse,
  convertObservation,
} from "@langfuse/shared/src/server";

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
};

export const generateObservationsForPublicApi = async (props: QueryType) => {
  const chFilter = generateFilter(props);
  const appliedFilter = chFilter.apply();
  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    with clickhouse_keys as (
      SELECT DISTINCT
        id,
        project_id,
        type,
        toDate(start_time),
      FROM observations o
      ${traceFilter ? `LEFT JOIN traces t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
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
      FROM observations o FINAL
      WHERE o.project_id = {projectId: String}
      AND (id, project_id, type, toDate(start_time)) in (select * from clickhouse_keys)
      ORDER BY start_time DESC
    `;

  const result = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: {
      ...appliedFilter.params,
      projectId: props.projectId,
      ...(props.limit !== undefined ? { limit: props.limit } : {}),
      ...(props.page !== undefined
        ? { offset: (props.page - 1) * props.limit }
        : {}),
    },
  });
  return result.map(convertObservation);
};

export const getObservationsCountForPublicApi = async (props: QueryType) => {
  const chFilter = generateFilter(props);
  const filter = chFilter.apply();
  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    SELECT count() as count
    FROM observations o
    ${traceFilter ? `LEFT JOIN traces t ON o.trace_id = t.id AND t.project_id = o.project_id` : ""}
    WHERE o.project_id = {projectId: String}
    ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
    AND ${filter.query}
  `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: { ...filter.params, projectId: props.projectId },
  });
  return records.map((record) => Number(record.count)).shift();
};

const filterParams = [
  {
    id: "userId",
    clickhouseSelect: "user_id",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "traceId",
    clickhouseSelect: "trace_id",
    filterType: "StringFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "name",
    clickhouseSelect: "name",
    filterType: "StringFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "level",
    clickhouseSelect: "level",
    filterType: "StringFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "type",
    clickhouseSelect: "type",
    filterType: "StringFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "parentObservationId",
    clickhouseSelect: "parent_observation_id",
    filterType: "StringFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "fromStartTime",
    clickhouseSelect: "start_time",
    operator: ">=" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "toStartTime",
    clickhouseSelect: "start_time",
    operator: "<" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "version",
    clickhouseSelect: "version",
    filterType: "StringFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "environment",
    clickhouseSelect: "environment",
    filterType: "StringFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
];

const generateFilter = (filter: QueryType) => {
  const observationsFilter = convertApiProvidedFilterToClickhouseFilter(
    filter,
    filterParams,
  );

  observationsFilter.push(
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: filter.projectId,
    }),
  );
  return observationsFilter;
};
