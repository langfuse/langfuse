import { Score, ScoreDataType, ScoreSource } from "@prisma/client";
import {
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  upsertClickhouse,
} from "./clickhouse";
import { FilterList } from "../queries/clickhouse-sql/clickhouse-filter";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-sql/factory";
import { OrderByState } from "../../interfaces/orderBy";
import {
  dashboardColumnDefinitions,
  scoresTableUiColumnDefinitions,
} from "../../tableDefinitions";
import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import {
  convertScoreAggregation,
  convertToScore,
  ScoreAggregation,
} from "./scores_converters";
import { SCORE_TO_TRACE_OBSERVATIONS_INTERVAL } from "./constants";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { ScoreRecordReadType } from "./definitions";

export const searchExistingAnnotationScore = async (
  projectId: string,
  traceId: string,
  observationId: string | null,
  name: string | undefined,
  configId: string | undefined,
) => {
  if (!name && !configId) {
    throw new Error("Either name or configId (or both) must be provided.");
  }
  const query = `
    SELECT *
    FROM scores s
    WHERE s.project_id = {projectId: String}
    AND s.source = 'ANNOTATION'
    AND s.trace_id = {traceId: String}
    ${observationId ? `AND s.observation_id = {observationId: String}` : "AND isNull(s.observation_id)"}
    AND (
      FALSE
      ${name ? `OR s.name = {name: String}` : ""}
      ${configId ? `OR s.config_id = {configId: String}` : ""}
    )
    ORDER BY s.event_ts DESC
    LIMIT 1 BY s.id, s.project_id
    LIMIT 1
  `;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query,
    params: {
      projectId,
      name,
      configId,
      traceId,
      observationId,
    },
  });
  return rows.map(convertToScore).shift();
};

export const getScoreById = async (
  projectId: string,
  scoreId: string,
  source?: ScoreSource,
) => {
  const query = `
    SELECT *
    FROM scores s
    WHERE s.project_id = {projectId: String}
    AND s.id = {scoreId: String}
    ${source ? `AND s.source = {source: String}` : ""}
    ORDER BY s.event_ts DESC
    LIMIT 1 BY s.id, s.project_id
    LIMIT 1
  `;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query,
    params: {
      projectId,
      scoreId,
      ...(source !== undefined ? { source } : {}),
    },
  });
  return rows.map(convertToScore).shift();
};

/**
 * Accepts a score in a Clickhouse-ready format.
 * id, project_id, name, and timestamp must always be provided.
 */
export const upsertScore = async (score: Partial<ScoreRecordReadType>) => {
  if (!["id", "project_id", "name", "timestamp"].every((key) => key in score)) {
    throw new Error("Identifier fields must be provided to upsert Score.");
  }
  await upsertClickhouse({
    table: "scores",
    records: [score as ScoreRecordReadType],
    eventBodyMapper: convertToScore,
  });
};

export const getScoresForTraces = async (
  projectId: string,
  traceIds: string[],
  timestamp?: Date,
  limit?: number,
  offset?: number,
) => {
  const query = `
      select 
        *
      from scores s
      WHERE s.project_id = {projectId: String}
      AND s.trace_id IN ({traceIds: Array(String)}) 
      ${timestamp ? `AND s.timestamp >= {traceTimestamp: DateTime64(3)} - ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL}` : ""}
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query: query,
    params: {
      projectId,
      traceIds,
      limit,
      offset,
      ...(timestamp
        ? { traceTimestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
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
      from scores s
      WHERE s.project_id = {projectId: String}
      AND s.observation_id IN ({observationIds: Array(String)})
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
      ${limit !== undefined && offset !== undefined ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<ScoreRecordReadType>({
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
  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
      select 
        name,
        source,
        data_type
      from scores s
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

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
      select 
        name as name
      from scores s
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

  // TODO: Can we realistically apply a traces time filter here? Is an order by event_ts a risk?
  const query = `
      SELECT 
          ${select}
      FROM scores s final
      LEFT JOIN traces t
      ON s.trace_id = t.id 
      AND t.project_id = s.project_id
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

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
      select 
        name,
        count(*) as count
      from scores s
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

export const deleteScore = async (projectId: string, scoreId: string) => {
  const query = `
    DELETE FROM scores
    WHERE project_id = {projectId: String}
    AND id = {scoreId: String};
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      scoreId,
    },
  });
};

export const deleteScoresByTraceIds = async (
  projectId: string,
  traceIds: string[],
) => {
  const query = `
    DELETE FROM scores
    WHERE project_id = {projectId: String}
    AND trace_id IN ({traceIds: Array(String)});
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      traceIds,
    },
  });
};

export const getNumericScoreHistogram = async (
  projectId: string,
  filter: FilterState,
  limit: number,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const query = `
    select s.value
    from scores s
    WHERE s.project_id = {projectId: String}
    ${chFilterRes?.query ? `AND ${chFilterRes.query}` : ""}
    ORDER BY s.event_ts DESC
    LIMIT 1 BY s.id, s.project_id
    ${limit !== undefined ? `limit {limit: Int32}` : ""}
  `;

  return queryClickhouse<{ value: number }>({
    query,
    params: {
      projectId,
      limit,
      ...(chFilterRes ? chFilterRes.params : {}),
    },
  });
};

export const getAggregatedScoresForPrompts = async (
  projectId: string,
  promptIds: string[],
  fetchScoreRelation: "observation" | "trace",
) => {
  const query = `
    SELECT 
      prompt_id,
      s.id,
      s.name,
      s.string_value,
      s.value,
      s.source,
      s.data_type,
      s.comment
    FROM scores s FINAL LEFT JOIN observations o FINAL 
      ON o.trace_id = s.trace_id 
      AND o.project_id = s.project_id 
      ${fetchScoreRelation === "observation" ? "AND o.id = s.observation_id" : ""}
    WHERE o.project_id = {projectId: String}
    AND s.project_id = {projectId: String}
    AND o.prompt_id IN ({promptIds: Array(String)})
    AND o.type = 'GENERATION'
    AND s.name IS NOT NULL
    ${fetchScoreRelation === "trace" ? "AND s.observation_id IS NULL" : ""}
  `;

  const rows = await queryClickhouse<ScoreAggregation & { prompt_id: string }>({
    query,
    params: {
      projectId,
      promptIds,
    },
  });

  return rows.map((row) => ({
    ...convertScoreAggregation(row),
    promptId: row.prompt_id,
  }));
};
