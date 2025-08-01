import { convertApiProvidedFilterToClickhouseFilter } from "@/src/features/public-api/server/filter-builder";
import { convertToScore, StringFilter } from "@langfuse/shared/src/server";
import { type ScoreRecordReadType } from "@langfuse/shared/src/server";
import { queryClickhouse } from "@langfuse/shared/src/server";

export type ScoreQueryType = {
  page: number;
  limit: number;
  projectId: string;
  traceId?: string;
  userId?: string;
  name?: string;
  source?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  value?: number;
  scoreId?: string;
  configId?: string;
  queueId?: string;
  traceTags?: string | string[];
  operator?: string;
  scoreIds?: string[];
  dataType?: string;
};

/**
 * @internal
 * Internal utility function for getting scores by ID.
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGenerateScoresForPublicApi = async ({
  props,
  scoreScope,
}: {
  props: ScoreQueryType;
  scoreScope: "traces_only" | "all";
}) => {
  const { scoresFilter, tracesFilter } = generateScoreFilter(props);
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  const query = `
      SELECT
          t.user_id as user_id,
          t.tags as tags,
          t.environment as trace_environment,
          s.id as id,
          s.project_id as project_id,
          s.timestamp as timestamp,
          s.environment as environment,
          s.name as name,
          s.value as value,
          s.string_value as string_value,
          s.author_user_id as author_user_id,
          s.created_at as created_at,
          s.updated_at as updated_at,
          s.source as source,
          s.comment as comment,
          s.metadata as metadata,
          s.data_type as data_type,
          s.config_id as config_id,
          s.queue_id as queue_id,
          s.trace_id as trace_id,
          s.observation_id as observation_id,
          s.session_id as session_id,
          s.dataset_run_id as dataset_run_id
      FROM
          scores s 
          LEFT JOIN traces t ON s.trace_id = t.id
          AND s.project_id = t.project_id
      WHERE
          s.project_id = {projectId: String}
          AND (
            ${scoreScope === "traces_only" ? "" : "s.trace_id IS NULL OR "}
            (s.trace_id IS NOT NULL AND (t.id, t.project_id) IN (
              SELECT
                trace_id,
                project_id
              FROM
                scores s
              WHERE
                s.project_id = {projectId: String}
                ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
                ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
              ORDER BY
                s.timestamp desc
              LIMIT
                1 BY s.id, s.project_id
                ))
          )
          ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
          ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
          ${tracesFilter.length() > 0 ? `AND ${appliedTracesFilter.query}` : ""}
      ORDER BY
          s.timestamp desc
      LIMIT
          1 BY s.id, s.project_id
      ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

  const records = await queryClickhouse<
    ScoreRecordReadType & {
      tags: string[];
      user_id: string;
      trace_environment: string;
    }
  >({
    query,
    params: {
      ...appliedScoresFilter.params,
      ...appliedTracesFilter.params,
      projectId: props.projectId,
      ...(props.limit !== undefined ? { limit: props.limit } : {}),
      ...(props.page !== undefined
        ? { offset: (props.page - 1) * props.limit }
        : {}),
    },
  });

  return records.map((record) => ({
    ...convertToScore(record),
    trace:
      record.trace_id !== null
        ? {
            userId: record.user_id,
            tags: record.tags,
            environment: record.trace_environment,
          }
        : null,
  }));
};

/**
 * @internal
 * Internal utility function for getting scores by ID.
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGetScoresCountForPublicApi = async ({
  props,
  scoreScope,
}: {
  props: ScoreQueryType;
  scoreScope: "traces_only" | "all";
}) => {
  const { scoresFilter, tracesFilter } = generateScoreFilter(props);
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  // for this query, we only need the traces join if we have a filter on traces
  const query = `
      SELECT
        count() as count
      FROM
        scores s 
          LEFT JOIN traces t ON s.trace_id = t.id
          AND s.project_id = t.project_id
      WHERE
        s.project_id = {projectId: String}
      AND (
        ${scoreScope === "traces_only" ? "" : "s.trace_id IS NULL OR "}
        (s.trace_id IS NOT NULL AND (t.id, t.project_id) IN (
          SELECT
            trace_id,
            project_id
          FROM
            scores s
          WHERE
            s.project_id = {projectId: String}
            ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
            ${scoreScope === "traces_only" ? "AND s.session_id IS NULL" : ""}
          ORDER BY
            s.timestamp desc
          LIMIT
            1 BY s.id, s.project_id
        ))
      )
      ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
      ${tracesFilter.length() > 0 ? `AND ${appliedTracesFilter.query}` : ""}
      `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: {
      ...appliedScoresFilter.params,
      ...appliedTracesFilter.params,
      projectId: props.projectId,
    },
  });
  return records.map((record) => Number(record.count)).shift();
};

const secureScoreFilterOptions = [
  {
    id: "traceId",
    clickhouseSelect: "trace_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "name",
    clickhouseSelect: "name",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "source",
    clickhouseSelect: "source",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "fromTimestamp",
    clickhouseSelect: "timestamp",
    operator: ">=" as const,
    clickhouseTable: "scores",
    filterType: "DateTimeFilter",
    clickhousePrefix: "s",
  },
  {
    id: "toTimestamp",
    clickhouseSelect: "timestamp",
    operator: "<" as const,
    clickhouseTable: "scores",
    filterType: "DateTimeFilter",
    clickhousePrefix: "s",
  },
  {
    id: "value",
    clickhouseSelect: "value",
    clickhouseTable: "scores",
    filterType: "NumberFilter",
    clickhousePrefix: "s",
  },
  {
    id: "scoreIds",
    clickhouseSelect: "id",
    clickhouseTable: "scores",
    filterType: "StringOptionsFilter",
    clickhousePrefix: "s",
  },
  {
    id: "configId",
    clickhouseSelect: "config_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "queueId",
    clickhouseSelect: "queue_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "environment",
    clickhouseSelect: "environment",
    clickhouseTable: "scores",
    filterType: "StringOptionsFilter",
    clickhousePrefix: "s",
  },
  {
    id: "dataType",
    clickhouseSelect: "data_type",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
];

const secureTraceFilterOptions = [
  {
    id: "traceTags",
    clickhouseSelect: "tags",
    clickhouseTable: "traces",
    filterType: "ArrayOptionsFilter",
    clickhousePrefix: "t",
  },
  {
    id: "userId",
    clickhouseSelect: "user_id",
    clickhouseTable: "traces",
    filterType: "StringFilter",
    clickhousePrefix: "t",
  },
  {
    id: "traceEnvironment",
    clickhouseSelect: "environment",
    clickhouseTable: "traces",
    filterType: "StringOptionsFilter",
    clickhousePrefix: "t",
  },
];

const generateScoreFilter = (filter: ScoreQueryType) => {
  const scoresFilter = convertApiProvidedFilterToClickhouseFilter(
    filter,
    secureScoreFilterOptions,
  );
  scoresFilter.push(
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: filter.projectId,
    }),
  );

  const tracesFilter = convertApiProvidedFilterToClickhouseFilter(
    filter,
    secureTraceFilterOptions,
  );

  return { scoresFilter, tracesFilter };
};
