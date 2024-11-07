import { Score, ScoreDataType, ScoreSource } from "@prisma/client";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import { FilterList } from "../queries/clickhouse-filter/clickhouse-filter";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-filter/factory";
import { OrderByState } from "../../interfaces/orderBy";
import { scoresTableUiColumnDefinitions } from "../../tableDefinitions";
import { orderByToClickhouseSql } from "../queries/clickhouse-filter/orderby-factory";
import { string } from "zod";

export type FetchScoresReturnType = {
  id: string;
  timestamp: string;
  project_id: string;
  trace_id: string;
  observation_id: string | null;
  name: string;
  value: number;
  source: string;
  comment: string | null;
  author_user_id: string | null;
  config_id: string | null;
  data_type: string;
  string_value: string | null;
  queue_id: string | null;
  created_at: string;
  updated_at: string;
  event_ts: string;
  is_deleted: number;
  projectId: string;
};

const convertToScore = (row: FetchScoresReturnType) => {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    projectId: row.project_id,
    traceId: row.trace_id,
    observationId: row.observation_id,
    name: row.name,
    value: row.value,
    source: row.source as ScoreSource,
    comment: row.comment,
    authorUserId: row.author_user_id,
    configId: row.config_id,
    dataType: row.data_type as ScoreDataType,
    stringValue: row.string_value,
    queueId: row.queue_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
};

export const getScoresForTraces = async (
  projectId: string,
  traceIds: string[],
  limit?: number,
  offset?: number,
) => {
  const query = `
      select 
        *
      from scores s final
      WHERE s.project_id = {projectId: String}
      AND s.trace_id IN ({traceIds: Array(String)})
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<FetchScoresReturnType>({
    query: query,
    params: {
      projectId: projectId,
      traceIds: traceIds,
      limit: limit,
      offset: offset,
    },
  });

  return rows.map(convertToScore);
};

export const getScoresForObservations = async (
  projectId: string,
  observationIds: string[],
  limit?: number,
  offset?: number,
) => {
  const query = `
      select 
        *
      from scores s final
      WHERE s.project_id = {projectId: String}
      AND s.observation_id IN ({observationIds: Array(String)})
      ${limit !== undefined && offset !== undefined ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<FetchScoresReturnType>({
    query: query,
    params: {
      projectId: projectId,
      observationIds: observationIds,
      limit: limit,
      offset: offset,
    },
  });

  return rows.map(convertToScore);
};

export const getScoresGroupedByNameSourceType = async (projectId: string) => {
  const query = `
      select 
        name,
        source,
        data_type
      from scores s final
      WHERE s.project_id = {projectId: String}
      GROUP BY name, source, data_type
      ORDER BY count() desc
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    name: string;
    source: string;
    data_type: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
    },
  });

  return rows.map((row) => ({
    name: row.name,
    source: row.source as ScoreSource,
    dataType: row.data_type as ScoreDataType,
  }));
};

export const getScoresGroupedByName = async (
  projectId: string,
  timestampFilter?: FilterState,
) => {
  const chFilter = timestampFilter
    ? createFilterFromFilterState(timestampFilter, [
        {
          uiTableName: "Timestamp",
          uiTableId: "timestamp",
          clickhouseTableName: "scores",
          clickhouseSelect: "timestamp",
        },
      ])
    : undefined;

  const timestampFilterRes = chFilter
    ? new FilterList(chFilter).apply()
    : undefined;

  const query = `
      select 
        name as name
      from scores s final
      WHERE s.project_id = {projectId: String}
      AND has(['NUMERIC', 'BOOLEAN'], s.data_type)
      ${timestampFilterRes?.query ? `AND ${timestampFilterRes.query}` : ""}
      GROUP BY name
      ORDER BY count() desc
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    name: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(timestampFilterRes ? timestampFilterRes.params : {}),
    },
  });

  return rows;
};

export const getScoresUiCount = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
}) => {
  const rows = await getScoresUiGeneric<{ count: string }>({
    select: `
    count(*) as count
    `,
    ...props,
  });

  return Number(rows[0].count);
};

export type ScoreUiTableRow = Score & {
  traceName: string | null;
  traceUserId: string | null;
  traceTags: Array<string> | null;
};

export const getScoresUiTable = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
}): Promise<ScoreUiTableRow[]> => {
  const rows = await getScoresUiGeneric<{
    id: string;
    project_id: string;
    name: string;
    value: number;
    string_value: string | null;
    timestamp: string;
    source: string;
    data_type: string;
    comment: string | null;
    trace_id: string;
    observation_id: string | null;
    author_user_id: string | null;
    user_id: string | null;
    trace_name: string | null;
    trace_tags: Array<string> | null;
    job_configuration_id: string | null;
    author_user_image: string | null;
    author_user_name: string | null;
    config_id: string | null;
    queue_id: string | null;
    created_at: string;
    updated_at: string;
  }>({
    select: `
        s.id,
        s.project_id,
        s.name,
        s.value,
        s.string_value,
        s.timestamp,
        s.source,
        s.data_type,
        s.comment,
        s.trace_id,
        s.observation_id,
        s.author_user_id,
        t.user_id,
        t.name,
        t.tags,
        s.created_at,
        s.updated_at,
        s.source,
        s.config_id,
        s.queue_id,
        t.user_id,
        t.name as trace_name,
        t.tags as trace_tags
    `,
    ...props,
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    authorUserId: row.author_user_id,
    traceId: row.trace_id,
    observationId: row.observation_id,
    traceUserId: row.user_id,
    traceName: row.trace_name,
    traceTags: row.trace_tags,
    configId: row.config_id,
    queueId: row.queue_id,
    createdAt: parseClickhouseUTCDateTimeFormat(row.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(row.updated_at),
    stringValue: row.string_value,
    comment: row.comment,
    dataType: row.data_type as ScoreDataType,
    source: row.source as ScoreSource,
    name: row.name,
    value: row.value,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    id: row.id,
  }));
};

export const getScoresUiGeneric = async <T>(props: {
  select: string;
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
}): Promise<T[]> => {
  const { select, projectId, filter, orderBy, limit, offset } = props;

  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

  scoresFilter.push(
    ...createFilterFromFilterState(filter, scoresTableUiColumnDefinitions),
  );

  const scoresFilterRes = scoresFilter.apply();

  const query = `
      SELECT 
          ${select}
      FROM scores s final
      LEFT JOIN traces t ON s.trace_id = t.id AND t.project_id = s.project_id
      WHERE s.project_id = {projectId: String}
      ${scoresFilterRes?.query ? `AND ${scoresFilterRes.query}` : ""}
      ${orderByToClickhouseSql(orderBy ?? null, scoresTableUiColumnDefinitions)}
      ${limit !== undefined && offset !== undefined ? `limit {limit: Int32} offset {offset: Int32}` : ""}

    `;

  const rows = await queryClickhouse<T>({
    query: query,
    params: {
      projectId: projectId,
      ...(scoresFilterRes ? scoresFilterRes.params : {}),
      limit: limit,
      offset: offset,
    },
  });

  return rows;
};

export const getScoreNames = async (
  projectId: string,
  timestampFilter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(
      timestampFilter,
      scoresTableUiColumnDefinitions,
    ),
  );
  const timestampFilterRes = chFilter.apply();

  const query = `
      select 
        name,
        count(*) as count
      from scores s final
      WHERE s.project_id = {projectId: String}
      ${timestampFilterRes?.query ? `AND ${timestampFilterRes.query}` : ""}
      GROUP BY name
      ORDER BY count() desc
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    name: string;
    count: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(timestampFilterRes ? timestampFilterRes.params : {}),
    },
  });

  return rows.map((row) => ({
    name: row.name,
    count: Number(row.count),
  }));
};
