import { ScoreDataType } from "@prisma/client";
import { ScoreDomain, ScoreSourceType } from "../../domain/scores";
import {
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  queryClickhouseStream,
  upsertClickhouse,
} from "./clickhouse";
import { FilterList, orderByToClickhouseSql } from "../queries";
import { FilterCondition, FilterState, TimeFilter } from "../../types";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-sql/factory";
import { OrderByState } from "../../interfaces/orderBy";
import {
  dashboardColumnDefinitions,
  scoresTableUiColumnDefinitions,
} from "../../tableDefinitions";
import {
  convertScoreAggregation,
  convertToScore,
  ScoreAggregation,
} from "./scores_converters";
import { SCORE_TO_TRACE_OBSERVATIONS_INTERVAL } from "./constants";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { ScoreRecordReadType } from "./definitions";
import { env } from "../../env";
import { _handleGetScoreById, _handleGetScoresByIds } from "./scores-utils";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { recordDistribution } from "../instrumentation";
import { prisma } from "../../db";

export const searchExistingAnnotationScore = async (
  projectId: string,
  observationId: string | null,
  traceId: string | null,
  sessionId: string | null,
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
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });
  return rows.map((row) => convertToScore(row)).shift();
};

export const getScoreById = async ({
  projectId,
  scoreId,
  source,
}: {
  projectId: string;
  scoreId: string;
  source?: ScoreSourceType;
}) => {
  return _handleGetScoreById({
    projectId,
    scoreId,
    source,
    scoreScope: "all",
  });
};

export const getScoresByIds = async (
  projectId: string,
  scoreId: string[],
  source?: ScoreSourceType,
) => {
  return _handleGetScoresByIds({
    projectId,
    scoreId,
    source,
    scoreScope: "all",
  });
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
    tags: {
      feature: "tracing",
      type: "score",
      kind: "upsert",
      projectId: score.project_id ?? "",
    },
  });
};

export type GetScoresForTracesProps<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
> = {
  projectId: string;
  traceIds: string[];
  timestamp?: Date;
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadata?: IncludeHasMetadata;
};

type GetScoresForSessionsProps<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
> = {
  projectId: string;
  sessionIds: string[];
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadata?: IncludeHasMetadata;
};

type GetScoresForDatasetRunsProps<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
> = {
  projectId: string;
  runIds: string[];
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadata?: IncludeHasMetadata;
};

const formatMetadataSelect = (
  excludeMetadata: boolean,
  includeHasMetadata: boolean,
) => {
  return [
    !excludeMetadata ? "*" : "* EXCEPT (metadata)",
    includeHasMetadata
      ? "length(mapKeys(s.metadata)) > 0 AS has_metadata"
      : null,
  ]
    .filter((s) => s != null)
    .join(", ");
};

export const getScoresForSessions = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForSessionsProps<ExcludeMetadata, IncludeHasMetadata>,
) => {
  const {
    projectId,
    sessionIds,
    limit,
    offset,
    clickhouseConfigs,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);

  const query = `
      select 
        ${select}
      from scores s
      WHERE s.project_id = {projectId: String}
      AND s.session_id IN ({sessionIds: Array(String)}) 
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query: query,
    params: {
      projectId,
      sessionIds,
      limit,
      offset,
    },
    tags: {
      feature: "sessions",
      type: "score",
      kind: "list",
      projectId,
    },
    clickhouseConfigs,
  });

  return rows.map(convertToScore);
};

export const getScoresForDatasetRuns = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForDatasetRunsProps<ExcludeMetadata, IncludeHasMetadata>,
) => {
  const {
    projectId,
    runIds,
    limit,
    offset,
    clickhouseConfigs,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);

  const query = `
      select 
        ${select}
      from scores s
      WHERE s.project_id = {projectId: String}
      AND s.dataset_run_id IN ({runIds: Array(String)}) 
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query: query,
    params: {
      projectId,
      runIds,
      limit,
      offset,
    },
    tags: {
      feature: "sessions",
      type: "score",
      kind: "list",
      projectId,
    },
    clickhouseConfigs,
  });

  return rows.map(convertToScore);
};

// Used in multiple places, including the public API, hence the non-default exclusion of metadata via excludeMetadata flag
export const getScoresForTraces = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForTracesProps<ExcludeMetadata, IncludeHasMetadata>,
) => {
  const {
    projectId,
    traceIds,
    timestamp,
    limit,
    offset,
    clickhouseConfigs,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);

  const query = `
      select
        ${select}
      from scores s
      WHERE s.project_id = {projectId: String}
      AND s.trace_id IN ({traceIds: Array(String)}) 
      ${timestamp ? `AND s.timestamp >= {traceTimestamp: DateTime64(3)} - ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL}` : ""}
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<
    ScoreRecordReadType & {
      metadata: ExcludeMetadata extends true
        ? never
        : ScoreRecordReadType["metadata"];
      // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
      has_metadata: IncludeHasMetadata extends true ? 0 | 1 : never;
    }
  >({
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
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
    clickhouseConfigs,
  });

  return rows.map((row) => {
    const score = convertToScore({
      ...row,
      metadata: excludeMetadata ? {} : row.metadata,
    });

    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - score.timestamp.getTime(),
      {
        table: "scores",
      },
    );

    if (includeHasMetadata) {
      Object.assign(score, { hasMetadata: !!row.has_metadata });
    }

    return score;
  });
};

export type GetScoresForObservationsProps<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
> = {
  projectId: string;
  observationIds: string[];
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadata?: IncludeHasMetadata;
};

// Currently only used from the observations table, hence the exclusion of metadata without excludeMetadata flag
export const getScoresForObservations = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForObservationsProps<ExcludeMetadata, IncludeHasMetadata>,
) => {
  const {
    projectId,
    observationIds,
    limit,
    offset,
    clickhouseConfigs,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const select = [
    !excludeMetadata ? "*" : "* EXCEPT (metadata)",
    includeHasMetadata
      ? "length(mapKeys(s.metadata)) > 0 AS has_metadata"
      : null,
  ]
    .filter((s) => s != null)
    .join(", ");

  const query = `
      select 
        ${select}
      from scores s
      WHERE s.project_id = {projectId: String}
      AND s.observation_id IN ({observationIds: Array(String)})
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
      ${limit !== undefined && offset !== undefined ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<
    ScoreRecordReadType & {
      metadata: ExcludeMetadata extends true
        ? never
        : ScoreRecordReadType["metadata"];
      // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
      has_metadata: IncludeHasMetadata extends true ? 0 | 1 : never;
    }
  >({
    query: query,
    params: {
      projectId: projectId,
      observationIds: observationIds,
      limit: limit,
      offset: offset,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
    clickhouseConfigs,
  });

  return rows.map((row) => ({
    ...convertToScore({
      ...row,
      metadata: excludeMetadata ? {} : row.metadata,
    }),
    hasMetadata: (includeHasMetadata
      ? !!row.has_metadata
      : undefined) as IncludeHasMetadata extends true ? boolean : never,
  }));
};

export const getRunScoresGroupedByNameSourceType = async (
  projectId: string,
  datasetRunIds: string[],
  timestamp: Date | undefined,
) => {
  if (datasetRunIds.length === 0) {
    return [];
  }

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    select 
      name,
      source,
      data_type
    from scores s
    WHERE s.project_id = {projectId: String}
    ${timestamp ? `AND s.timestamp >= {timestamp: DateTime64(3)}` : ""}
    AND s.dataset_run_id IN ({datasetRunIds: Array(String)})
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
      ...(timestamp
        ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
      datasetRunIds: datasetRunIds,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => ({
    name: row.name,
    source: row.source as ScoreSourceType,
    dataType: row.data_type as ScoreDataType,
  }));
};

export const getScoresGroupedByNameSourceType = async (
  projectId: string,
  timestamp: Date | undefined,
) => {
  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    select 
      name,
      source,
      data_type
    from scores s
    WHERE s.project_id = {projectId: String}
    ${timestamp ? `AND s.timestamp >= {timestamp: DateTime64(3)}` : ""}
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
      ...(timestamp
        ? { timestamp: convertDateToClickhouseDateTime(timestamp) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => ({
    name: row.name,
    source: row.source as ScoreSourceType,
    dataType: row.data_type as ScoreDataType,
  }));
};

export const getNumericScoresGroupedByName = async (
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
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows;
};

export const getCategoricalScoresGroupedByName = async (
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
    SELECT
      name AS label,
      groupArray(DISTINCT string_value) AS values
    FROM scores s
    WHERE s.project_id = {projectId: String}
    AND s.data_type = 'CATEGORICAL'
    ${timestampFilterRes?.query ? `AND ${timestampFilterRes.query}` : ""}
    GROUP BY name
    ORDER BY count() DESC
    LIMIT 1000;
  `;

  const rows = await queryClickhouse<{
    label: string;
    values: string[];
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(timestampFilterRes ? timestampFilterRes.params : {}),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  // Get score names from ClickHouse results to query score configs
  const scoreNames = rows.map((row) => row.label);

  // Query score_configs table for categorical configurations
  const scoreConfigs =
    scoreNames.length > 0
      ? await prisma.scoreConfig.findMany({
          where: {
            projectId: projectId,
            name: {
              in: scoreNames,
            },
            dataType: "CATEGORICAL",
            isArchived: false,
          },
          select: {
            name: true,
            categories: true,
          },
        })
      : [];

  // Create a map of score configs for easy lookup
  const configMap = new Map(
    scoreConfigs.map((config) => [config.name, config.categories]),
  );

  // Enhance the results with all possible category values from score configs
  return rows.map((row) => {
    const configCategories = configMap.get(row.label);

    if (configCategories && Array.isArray(configCategories)) {
      // Extract all possible category labels from the score config
      const allPossibleValues = (
        configCategories as Array<{ label: string; value: number }>
      ).map((category) => category.label);

      // Merge actual values from ClickHouse with all possible values from config
      // Use Set to ensure uniqueness
      const mergedValues = Array.from(
        new Set([...row.values, ...allPossibleValues]),
      );

      return {
        ...row,
        values: mergedValues,
      };
    }

    // If no config found, return original values
    return row;
  });
};

export const getScoresUiCount = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
}) => {
  const rows = await getScoresUiGeneric<{ count: string }>({
    select: "count",
    excludeMetadata: true,
    tags: { kind: "count" },
    ...props,
  });

  return Number(rows[0].count);
};

export type ScoreUiTableRow = ScoreDomain & {
  traceName: string | null;
  traceUserId: string | null;
  traceTags: Array<string> | null;
};

export async function getScoresUiTable<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadataFlag?: IncludeHasMetadata;
}) {
  const {
    excludeMetadata = false,
    includeHasMetadataFlag = false,
    clickhouseConfigs,
    ...rest
  } = props;

  const rows = await getScoresUiGeneric<{
    id: string;
    project_id: string;
    environment: string;
    name: string;
    value: number;
    string_value: string | null;
    timestamp: string;
    source: string;
    data_type: string;
    comment: string | null;
    trace_id: string | null;
    session_id: string | null;
    dataset_run_id: string | null;
    metadata: ExcludeMetadata extends true ? never : Record<string, string>;
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
    // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
    has_metadata: IncludeHasMetadata extends true ? 0 | 1 : never;
  }>({
    select: "rows",
    tags: { kind: "analytic" },
    excludeMetadata,
    includeHasMetadataFlag,
    clickhouseConfigs,
    ...rest,
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    environment: row.environment,
    authorUserId: row.author_user_id,
    traceId: row.trace_id,
    sessionId: row.session_id,
    observationId: row.observation_id,
    datasetRunId: row.dataset_run_id,
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
    source: row.source as ScoreSourceType,
    name: row.name,
    value: row.value,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    id: row.id,
    metadata: (excludeMetadata
      ? undefined
      : (parseMetadataCHRecordToDomain(row.metadata ?? {}) ??
        {})) as ExcludeMetadata extends true
      ? never
      : NonNullable<ReturnType<typeof parseMetadataCHRecordToDomain>>,
    hasMetadata: (includeHasMetadataFlag
      ? !!row.has_metadata
      : undefined) as IncludeHasMetadata extends true ? boolean : never,
  }));
}

const getScoresUiGeneric = async <T>(props: {
  select: "count" | "rows";
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
  tags?: Record<string, string>;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
  excludeMetadata?: boolean;
  includeHasMetadataFlag?: boolean;
}): Promise<T[]> => {
  const {
    projectId,
    filter,
    orderBy,
    limit,
    offset,
    clickhouseConfigs,
    excludeMetadata = false,
    includeHasMetadataFlag = false,
  } = props;

  const select =
    props.select === "count"
      ? "count(*) as count"
      : `
        s.id,
        s.project_id,
        s.environment,
        s.name,
        s.value,
        s.string_value,
        s.timestamp,
        s.source,
        s.data_type,
        s.comment,
        ${excludeMetadata ? "" : "s.metadata,"}
        s.trace_id,
        s.session_id,
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
        ${includeHasMetadataFlag ? ",length(mapKeys(s.metadata)) > 0 AS has_metadata" : ""}
      `;

  const { scoresFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });
  scoresFilter.push(
    ...createFilterFromFilterState(filter, scoresTableUiColumnDefinitions),
  );
  const scoresFilterRes = scoresFilter.apply();

  // Only join traces for rows or if there is a trace filter on counts
  const performTracesJoin =
    props.select === "rows" ||
    scoresFilter.some((f) => f.clickhouseTable === "traces");

  const query = `
      SELECT 
          ${select}
      FROM scores s final
      ${performTracesJoin ? "LEFT JOIN traces t ON s.trace_id = t.id AND t.project_id = s.project_id" : ""}
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
    tags: {
      ...(props.tags ?? {}),
      feature: "tracing",
      type: "score",
      projectId,
    },
    clickhouseConfigs,
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
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => ({
    name: row.name,
    count: Number(row.count),
  }));
};

export const deleteScores = async (projectId: string, scoreIds: string[]) => {
  const query = `
    DELETE FROM scores
    WHERE project_id = {projectId: String}
    AND id in ({scoreIds: Array(String)});
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      scoreIds,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "delete",
      projectId,
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
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteScoresByProjectId = async (projectId: string) => {
  const query = `
    DELETE FROM scores
    WHERE project_id = {projectId: String};
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteScoresOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
) => {
  const query = `
    DELETE FROM scores
    WHERE project_id = {projectId: String}
    AND timestamp < {cutoffDate: DateTime64(3)};
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      cutoffDate: convertDateToClickhouseDateTime(beforeDate),
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "delete",
      projectId,
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

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  const query = `
    select s.value
    from scores s
    ${traceFilter ? `LEFT JOIN traces t ON s.trace_id = t.id AND t.project_id = s.project_id` : ""}
    WHERE s.project_id = {projectId: String}
    ${traceFilter ? `AND t.project_id = {projectId: String}` : ""}
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
    tags: {
      feature: "tracing",
      type: "score",
      kind: "analytic",
      projectId,
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
      s.comment,
      length(mapKeys(s.metadata)) > 0 AS has_metadata
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

  const rows = await queryClickhouse<
    ScoreAggregation & {
      prompt_id: string;
      // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
      has_metadata: 0 | 1;
    }
  >({
    query,
    params: {
      projectId,
      promptIds,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((row) => ({
    ...convertScoreAggregation(row),
    promptId: row.prompt_id,
    hasMetadata: !!row.has_metadata,
  }));
};

export const getScoreCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const query = `
    SELECT 
      project_id,
      count(*) as count
    FROM scores
    WHERE created_at >= {start: DateTime64(3)}
    AND created_at < {end: DateTime64(3)}
    GROUP BY project_id
  `;

  const rows = await queryClickhouse<{ project_id: string; count: string }>({
    query,
    params: {
      start: convertDateToClickhouseDateTime(start),
      end: convertDateToClickhouseDateTime(end),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "analytic",
    },
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    count: Number(row.count),
  }));
};

export const getScoreCountOfProjectsSinceCreationDate = async ({
  projectIds,
  start,
}: {
  projectIds: string[];
  start: Date;
}) => {
  const query = `
    SELECT 
      count(*) as count
    FROM scores
    WHERE project_id IN ({projectIds: Array(String)})
    AND created_at >= {start: DateTime64(3)}
  `;

  const rows = await queryClickhouse<{ count: string }>({
    query,
    params: {
      projectIds,
      start: convertDateToClickhouseDateTime(start),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "analytic",
    },
  });

  return Number(rows[0]?.count ?? 0);
};

export const getDistinctScoreNames = async (p: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterState;
  isTimestampFilter: (filter: FilterCondition) => filter is TimeFilter;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) => {
  const {
    projectId,
    cutoffCreatedAt,
    filter,
    isTimestampFilter,
    clickhouseConfigs,
  } = p;
  const scoreTimestampFilter = filter?.find(isTimestampFilter);

  const query = `    SELECT DISTINCT
      name
    FROM scores s 
    WHERE s.project_id = {projectId: String}
    AND s.created_at <= {cutoffCreatedAt: DateTime64(3)}
    ${scoreTimestampFilter ? `AND s.timestamp >= {filterTimestamp: DateTime64(3)}` : ""}
  `;

  const rows = await queryClickhouse<{ name: string }>({
    query,
    params: {
      projectId,
      cutoffCreatedAt: convertDateToClickhouseDateTime(cutoffCreatedAt),
      ...(scoreTimestampFilter
        ? {
            filterTimestamp: convertDateToClickhouseDateTime(
              scoreTimestampFilter.value,
            ),
          }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
    clickhouseConfigs,
  });

  return rows.map((row) => row.name);
};

export const getScoresForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const query = `
    SELECT
      id,
      timestamp,
      project_id,
      environment,
      trace_id,
      observation_id,
      name,
      value,
      source,
      comment,
      data_type,
      string_value
    FROM scores FINAL
    WHERE project_id = {projectId: String}
    AND timestamp >= {minTimestamp: DateTime64(3)}
    AND timestamp <= {maxTimestamp: DateTime64(3)}
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "blobstorage",
      type: "score",
      kind: "analytic",
      projectId,
    },
  });

  return records;
};

export const getScoresForPostHog = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const query = `    SELECT
      s.id as id,
      s.timestamp as timestamp,
      s.name as name,
      s.value as value,
      s.comment as comment,
      s.environment as environment,
      t.name as trace_name,
      t.session_id as trace_session_id,
      t.user_id as trace_user_id,
      t.release as trace_release,
      t.tags as trace_tags,
      t.metadata['$posthog_session_id'] as posthog_session_id
    FROM scores s FINAL
    LEFT JOIN traces t FINAL ON s.trace_id = t.id AND s.project_id = t.project_id
    WHERE s.project_id = {projectId: String}
    AND t.project_id = {projectId: String}
    AND s.timestamp >= {minTimestamp: DateTime64(3)}
    AND s.timestamp <= {maxTimestamp: DateTime64(3)}
    AND t.timestamp >= {minTimestamp: DateTime64(3)} - INTERVAL 7 DAY
    AND t.timestamp <= {maxTimestamp: DateTime64(3)}
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "posthog",
      type: "score",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: 300_000, // 5 minutes
      clickhouse_settings: {
        join_algorithm: "grace_hash",
        grace_hash_join_initial_buckets: "32",
      },
    },
  });

  const baseUrl = env.NEXTAUTH_URL?.replace("/api/auth", "");
  for await (const record of records) {
    yield {
      timestamp: record.timestamp,
      langfuse_score_name: record.name,
      langfuse_score_value: record.value,
      langfuse_score_comment: record.comment,
      langfuse_trace_name: record.trace_name,
      langfuse_id: record.id,
      langfuse_session_id: record.trace_session_id,
      langfuse_project_id: projectId,
      langfuse_user_id: record.trace_user_id || "langfuse_unknown_user",
      langfuse_release: record.trace_release,
      langfuse_tags: record.trace_tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      $session_id: record.posthog_session_id ?? null,
      $set: {
        langfuse_user_url: record.user_id
          ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.user_id as string)}`
          : null,
      },
    };
  }
};

export const hasAnyScore = async (projectId: string) => {
  const query = `    SELECT 1
    FROM scores
    WHERE project_id = {projectId: String}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: {
      projectId,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "hasAny",
      projectId,
    },
  });

  return rows.length > 0;
};

export const getScoreMetadataById = async (
  projectId: string,
  id: string,
  source?: ScoreSourceType,
) => {
  const query = `    SELECT 
      metadata
    FROM scores s
    WHERE s.project_id = {projectId: String}
    AND s.id = {id: String}
    ${source ? `AND s.source = {source: String}` : ""}
    ORDER BY s.event_ts DESC
    LIMIT 1 BY s.id, s.project_id
    LIMIT 1
  `;

  const rows = await queryClickhouse<Pick<ScoreRecordReadType, "metadata">>({
    query,
    params: {
      projectId,
      id,
      ...(source !== undefined ? { source } : {}),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "getScoreMetadataById",
      projectId,
    },
  });

  return rows
    .map((row) =>
      parseMetadataCHRecordToDomain(row.metadata as Record<string, string>),
    )
    .shift();
};
