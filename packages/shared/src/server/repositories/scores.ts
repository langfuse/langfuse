import { ScoreDataType, ScoreSource } from "@prisma/client";
import { queryClickhouse } from "./clickhouse";

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
  limit: number,
  offset: number
) => {
  const query = `
      select 
        *
      from scores s final
      WHERE s.project_id = {projectId: String}
      AND s.trace_id IN ({traceIds: Array(String)})
      limit {limit: Int32} offset {offset: Int32};
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
