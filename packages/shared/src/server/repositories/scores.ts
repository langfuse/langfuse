import {
  ScoreDataTypeType,
  ScoreDomain,
  ScoreSourceType,
  AGGREGATABLE_SCORE_TYPES,
  AggregatableScoreDataType,
} from "../../domain/scores";
import {
  commandClickhouse,
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
  scoresTableUiColumnDefinitionsFromEvents,
} from "../tableMappings";
import {
  convertScoreAggregation,
  convertClickhouseScoreToDomain,
  ScoreAggregation,
} from "./scores_converters";
import { SCORE_TO_TRACE_OBSERVATIONS_INTERVAL } from "./constants";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import { ScoreRecordReadType } from "./definitions";
import { env } from "../../env";
import { _handleGetScoreById, _handleGetScoresByIds } from "./scores-utils";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import type { AnalyticsScoreEvent } from "../analytics-integrations/types";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { recordDistribution } from "../instrumentation";
import { prisma } from "../../db";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { scoresColumnsTableUiColumnDefinitions } from "../tableMappings/mapScoresColumnsTable";
import { eventsTraceMetadata } from "../queries/clickhouse-sql/query-fragments";

export const searchExistingAnnotationScore = async (
  projectId: string,
  observationId: string | null,
  traceId: string | null,
  sessionId: string | null,
  name: string | undefined,
  configId: string | undefined,
  dataType: ScoreDataTypeType,
) => {
  if (!name && !configId) {
    throw new Error("Either name or configId (or both) must be provided.");
  }

  const query = `
    SELECT *
    FROM scores s
    WHERE s.project_id = {projectId: String}
    AND s.source = 'ANNOTATION'
    AND s.data_type = {dataType: String}
    ${traceId ? `AND s.trace_id = {traceId: String}` : "AND isNull(s.trace_id)"}
    ${observationId ? `AND s.observation_id = {observationId: String}` : "AND isNull(s.observation_id)"}
    ${sessionId ? `AND s.session_id = {sessionId: String}` : "AND isNull(s.session_id)"}
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
      sessionId,
      dataType,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });
  return rows.map((row) => convertClickhouseScoreToDomain(row)).shift();
};

export const getScoreById = async ({
  projectId,
  scoreId,
  source,
}: {
  projectId: string;
  scoreId: string;
  source?: ScoreSourceType;
}): Promise<ScoreDomain | undefined> => {
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
): Promise<ScoreDomain[]> => {
  return _handleGetScoresByIds({
    projectId,
    scoreId,
    source,
    scoreScope: "all",
    dataTypes: AGGREGATABLE_SCORE_TYPES,
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
    eventBodyMapper: convertClickhouseScoreToDomain,
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
  preferredClickhouseService?: PreferredClickhouseService;
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
      AND s.data_type IN ({dataTypes: Array(String)})
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
      dataTypes: AGGREGATABLE_SCORE_TYPES,
    },
    tags: {
      feature: "sessions",
      type: "score",
      kind: "list",
      projectId,
    },
    clickhouseConfigs,
  });

  const includeMetadataPayload = excludeMetadata ? false : true;
  return rows.map((row) =>
    convertClickhouseScoreToDomain(row, includeMetadataPayload),
  );
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
      AND s.data_type IN ({dataTypes: Array(String)})
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query: query,
    params: {
      projectId,
      runIds,
      dataTypes: AGGREGATABLE_SCORE_TYPES,
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

  const includeMetadataPayload = excludeMetadata ? false : true;
  return rows.map((row) =>
    convertClickhouseScoreToDomain<ExcludeMetadata, AggregatableScoreDataType>(
      row,
      includeMetadataPayload,
    ),
  );
};

export const getTraceScoresForDatasetRuns = async (
  projectId: string,
  datasetRunIds: string[],
): Promise<Array<{ dataset_run_id: string } & any>> => {
  if (datasetRunIds.length === 0) return [];

  const query = `
    SELECT
      s.id as id,
      s.timestamp as timestamp,
      s.project_id as project_id,
      s.environment as environment,
      s.trace_id as trace_id,
      s.session_id as session_id,
      s.observation_id as observation_id,
      s.dataset_run_id as dataset_run_id,
      s.name as name,
      s.value as value,
      s.source as source,
      s.comment as comment,
      s.author_user_id as author_user_id,
      s.config_id as config_id,
      s.data_type as data_type,
      s.string_value as string_value,
      s.queue_id as queue_id,
      s.execution_trace_id as execution_trace_id,
      s.created_at as created_at,
      s.updated_at as updated_at,
      s.event_ts as event_ts,
      s.is_deleted as is_deleted,
      length(mapKeys(s.metadata)) > 0 AS has_metadata,
      dri.dataset_run_id as run_id
    FROM dataset_run_items_rmt dri
    JOIN scores s FINAL ON dri.trace_id = s.trace_id
      AND dri.project_id = s.project_id
    WHERE dri.project_id = {projectId: String}
      AND dri.dataset_run_id IN {datasetRunIds: Array(String)}
      AND s.project_id = {projectId: String}
      AND s.data_type IN ({dataTypes: Array(String)})
    ORDER BY s.event_ts DESC
    LIMIT 1 BY s.id, s.project_id, dri.dataset_run_id
  `;

  const rows = await queryClickhouse<
    Omit<ScoreRecordReadType, "metadata"> & {
      has_metadata: 0 | 1;
      run_id: string;
    }
  >({
    query,
    params: {
      projectId,
      datasetRunIds,
      dataTypes: AGGREGATABLE_SCORE_TYPES,
    },
    tags: {
      feature: "dataset-run-items",
      type: "trace-scores",
      kind: "list",
      projectId,
    },
  });

  const includeMetadataPayload = false;
  return rows.map((row) => ({
    ...convertClickhouseScoreToDomain(
      { ...row, metadata: {} },
      includeMetadataPayload,
    ),
    datasetRunId: row.run_id,
    hasMetadata: !!row.has_metadata,
  }));
};

const getScoresForTracesInternal = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
  DataTypes extends readonly ScoreDataTypeType[],
>(
  props: GetScoresForTracesProps<ExcludeMetadata, IncludeHasMetadata> & {
    dataTypes?: DataTypes;
  },
) => {
  const {
    projectId,
    traceIds,
    timestamp,
    dataTypes,
    limit,
    offset,
    clickhouseConfigs,
    excludeMetadata = false,
    includeHasMetadata = false,
    preferredClickhouseService,
  } = props;

  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);

  const query = `
      select
        ${select}
      from scores s
      WHERE s.project_id = {projectId: String}
      AND s.trace_id IN ({traceIds: Array(String)})
      ${dataTypes ? `AND s.data_type IN ({dataTypes: Array(String)})` : ""}
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
      ...(dataTypes ? { dataTypes: dataTypes.map((d) => d.toString()) } : {}),
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
    preferredClickhouseService,
  });

  const includeMetadataPayload = excludeMetadata ? false : true;
  return rows.map((row) => {
    const score = convertClickhouseScoreToDomain(
      {
        ...row,
        metadata: excludeMetadata ? {} : row.metadata,
      },
      includeMetadataPayload,
    );

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

// Used in multiple places, including the public API, hence the non-default exclusion of metadata via excludeMetadata flag
export const getScoresForTraces = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForTracesProps<ExcludeMetadata, IncludeHasMetadata>,
) => {
  return getScoresForTracesInternal({
    ...props,
    dataTypes: AGGREGATABLE_SCORE_TYPES,
  });
};

export const getScoresAndCorrectionsForTraces = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForTracesProps<ExcludeMetadata, IncludeHasMetadata>,
) => {
  return getScoresForTracesInternal({
    ...props,
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
      AND s.data_type IN ({dataTypes: Array(String)})
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
      dataTypes: AGGREGATABLE_SCORE_TYPES,
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

  const includeMetadataPayload = excludeMetadata ? false : true;
  return rows.map((row) => ({
    ...convertClickhouseScoreToDomain(
      {
        ...row,
        metadata: excludeMetadata ? {} : row.metadata,
      },
      includeMetadataPayload,
    ),
    hasMetadata: (includeHasMetadata
      ? !!row.has_metadata
      : undefined) as IncludeHasMetadata extends true ? boolean : never,
  }));
};

export const getScoresGroupedByNameSourceType = async ({
  projectId,
  filter,
  fromTimestamp,
  toTimestamp,
}: {
  projectId: string;
  filter: FilterCondition[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
}) => {
  const scoresFilter = new FilterList();
  scoresFilter.push(
    ...createFilterFromFilterState(
      filter,
      scoresColumnsTableUiColumnDefinitions,
    ),
  );
  const scoresFilterRes = scoresFilter.apply();

  // Only join dataset run items and traces if there is a dataset run items filter
  const performDatasetRunItemsAndTracesJoin = scoresFilter.some(
    (f) => f.clickhouseTable === "dataset_run_items_rmt",
  );

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.

  const query = `
    select
      s.name as name,
      s.source as source,
      s.data_type as data_type
    FROM scores s
    ${performDatasetRunItemsAndTracesJoin ? `JOIN dataset_run_items_rmt dri ON s.trace_id = dri.trace_id AND s.project_id = dri.project_id` : ""}
    WHERE s.project_id = {projectId: String}
    ${scoresFilterRes?.query ? `AND ${scoresFilterRes.query}` : ""}
    ${fromTimestamp ? `AND s.timestamp >= {fromTimestamp: DateTime64(3)}` : ""}
    ${toTimestamp ? `AND s.timestamp <= {toTimestamp: DateTime64(3)}` : ""}
    AND s.data_type IN ({dataTypes: Array(String)})
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
      dataTypes: AGGREGATABLE_SCORE_TYPES,
      ...(fromTimestamp
        ? { fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp) }
        : {}),
      ...(toTimestamp
        ? { toTimestamp: convertDateToClickhouseDateTime(toTimestamp) }
        : {}),
      ...(scoresFilterRes ? scoresFilterRes.params : {}),
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
    dataType: row.data_type as AggregatableScoreDataType,
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
    execution_trace_id: string | null;
    is_deleted: number;
    event_ts: string;
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

  const includeMetadataPayload = excludeMetadata ? false : true;
  return rows.map((row) => {
    const score = convertClickhouseScoreToDomain(
      {
        ...row,
        metadata: excludeMetadata ? {} : row.metadata,
        // Long string value is never required for scores UI table, so we always return an empty string
        long_string_value: "",
      },
      includeMetadataPayload,
    );
    return {
      ...score,
      traceUserId: row.user_id,
      traceName: row.trace_name,
      traceTags: row.trace_tags,
      hasMetadata: (includeHasMetadataFlag
        ? !!row.has_metadata
        : undefined) as IncludeHasMetadata extends true ? boolean : never,
    };
  });
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
        s.execution_trace_id,
        s.is_deleted,
        s.event_ts,
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
      AND s.data_type IN ({dataTypes: Array(String)})
      ${scoresFilterRes?.query ? `AND ${scoresFilterRes.query}` : ""}
      ${orderByToClickhouseSql(orderBy ?? null, scoresTableUiColumnDefinitions)}
      ${limit !== undefined && offset !== undefined ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  return measureAndReturn({
    operationName: "getScoresUiGeneric",
    projectId,
    input: {
      params: {
        projectId: projectId,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        ...(scoresFilterRes ? scoresFilterRes.params : {}),
        limit: limit,
        offset: offset,
      },
      tags: {
        ...(props.tags ?? {}),
        feature: "tracing",
        type: "score",
        projectId,
        select: props.select,
        operation_name: "getScoresUiGeneric",
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        clickhouseConfigs,
      });
    },
  });
};

/**
 * Trace column mapping for building WHERE filters inside the flat events CTE.
 * References actual events_core columns (trace_name, user_id, tags) with the
 * "e" prefix used by EventsQueryBuilder.
 */
const scoresTraceFilterEventsMapping = [
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "traces",
    clickhouseSelect: "trace_name",
    queryPrefix: "e",
  },
  {
    uiTableName: "User ID",
    uiTableId: "userId",
    clickhouseTableName: "traces",
    clickhouseSelect: "user_id",
    queryPrefix: "e",
  },
  {
    uiTableName: "Trace Tags",
    uiTableId: "trace_tags",
    clickhouseTableName: "traces",
    clickhouseSelect: "tags",
    queryPrefix: "e",
  },
];

/**
 * v4 variant: scores query using a flat events CTE instead of the physical
 * traces table. Trace-level filters and sort use a "traces" CTE built by
 * EventsQueryBuilder, joined as alias "e".
 * Does NOT select trace metadata (that comes via metricsFromEvents).
 */
const getScoresUiGenericFromEvents = async <T>(props: {
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

  // tracesPrefix value is unused here — only scoresFilter is destructured,
  // and trace-level filtering is handled via the CTE below.
  const { scoresFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });
  scoresFilter.push(
    ...createFilterFromFilterState(
      filter,
      scoresTableUiColumnDefinitionsFromEvents,
    ),
  );

  const scoreOnlyFilters = scoresFilter.filter(
    (f) => f.clickhouseTable !== "traces",
  );
  const scoreOnlyFilterRes = scoreOnlyFilters.apply();

  // Trace-level filter entries from the frontend filter state
  const traceFilterState = filter.filter((filterEntry) =>
    scoresTraceFilterEventsMapping.some(
      (col) =>
        col.uiTableName === filterEntry.column ||
        col.uiTableId === filterEntry.column,
    ),
  );

  const orderByColumn = orderBy
    ? scoresTableUiColumnDefinitionsFromEvents.find(
        (c) =>
          (c.uiTableName === orderBy.column ||
            c.uiTableId === orderBy.column) &&
          c.clickhouseTableName === "traces",
      )
    : null;

  const needsTracesCTE = traceFilterState.length > 0 || !!orderByColumn;

  // Build traces CTE using flat EventsQueryBuilder when needed
  let tracesCTEClause = "";
  const tracesCTEParams: Record<string, unknown> = {};

  if (needsTracesCTE) {
    const tracesEventsBuilder = eventsTraceMetadata(projectId);

    if (traceFilterState.length > 0) {
      const cteTraceFilters = new FilterList(
        createFilterFromFilterState(
          traceFilterState,
          scoresTraceFilterEventsMapping,
        ),
      );
      const cteTraceFilterRes = cteTraceFilters.apply();
      if (cteTraceFilterRes.query) {
        tracesEventsBuilder.where(cteTraceFilterRes);
      }
    }

    const { query: cteQuery, params: cteParams } =
      tracesEventsBuilder.buildWithParams();
    tracesCTEClause = `WITH traces AS (${cteQuery})`;
    Object.assign(tracesCTEParams, cteParams);
  }

  // Inner join when trace filters are active (exclude scores without matching traces)
  // Left join when only sorting (keep all scores)
  const eventsJoin = needsTracesCTE
    ? traceFilterState.length > 0
      ? `ANY JOIN traces e ON s.trace_id = e.id`
      : `LEFT ANY JOIN traces e ON s.trace_id = e.id`
    : "";

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
        s.created_at,
        s.updated_at,
        s.config_id,
        s.queue_id,
        s.execution_trace_id,
        s.is_deleted,
        s.event_ts
        ${includeHasMetadataFlag ? ",length(mapKeys(s.metadata)) > 0 AS has_metadata" : ""}
      `;

  const query = `
      ${tracesCTEClause}
      SELECT
          ${select}
      FROM scores s final
      ${eventsJoin}
      WHERE s.project_id = {projectId: String}
      AND s.data_type IN ({dataTypes: Array(String)})
      ${scoreOnlyFilterRes?.query ? `AND ${scoreOnlyFilterRes.query}` : ""}
      ${orderByToClickhouseSql(orderBy ?? null, scoresTableUiColumnDefinitionsFromEvents)}
      ${limit !== undefined && offset !== undefined ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  return measureAndReturn({
    operationName: "getScoresUiGenericFromEvents",
    projectId,
    input: {
      params: {
        projectId,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        ...(scoreOnlyFilterRes ? scoreOnlyFilterRes.params : {}),
        ...tracesCTEParams,
        limit,
        offset,
      },
      tags: {
        ...(props.tags ?? {}),
        feature: "tracing",
        type: "score",
        projectId,
        select: props.select,
        operation_name: "getScoresUiGenericFromEvents",
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        clickhouseConfigs,
      });
    },
  });
};

export const getScoresUiCountFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
}) => {
  const rows = await getScoresUiGenericFromEvents<{ count: string }>({
    select: "count",
    excludeMetadata: true,
    tags: { kind: "count" },
    ...props,
  });

  return Number(rows[0].count);
};

export type ScoreUiTableRowFromEvents = Omit<ScoreDomain, "metadata"> & {
  hasMetadata: boolean;
};

export async function getScoresUiTableFromEvents(props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
}) {
  const { clickhouseConfigs, ...rest } = props;

  const rows = await getScoresUiGenericFromEvents<{
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
    observation_id: string | null;
    author_user_id: string | null;
    config_id: string | null;
    queue_id: string | null;
    execution_trace_id: string | null;
    is_deleted: number;
    event_ts: string;
    created_at: string;
    updated_at: string;
    has_metadata: 0 | 1;
  }>({
    select: "rows",
    tags: { kind: "analytic" },
    excludeMetadata: true,
    includeHasMetadataFlag: true,
    clickhouseConfigs,
    ...rest,
  });

  return rows.map((row) => {
    const score = convertClickhouseScoreToDomain(
      {
        ...row,
        metadata: {},
        long_string_value: "",
      },
      false,
    );
    return {
      ...score,
      hasMetadata: !!row.has_metadata,
    };
  });
}

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
      AND s.data_type IN ({dataTypes: Array(String)})
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
      dataTypes: AGGREGATABLE_SCORE_TYPES,
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

export const getScoreStringValues = async (
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
        string_value,
        count(*) as count
      from scores s
      WHERE s.project_id = {projectId: String}
      AND string_value IS NOT NULL
      AND string_value != ''
      ${timestampFilterRes?.query ? `AND ${timestampFilterRes.query}` : ""}
      GROUP BY string_value
      ORDER BY count() desc
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    string_value: string;
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
    value: row.string_value,
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

export const deleteScoresByProjectId = async (
  projectId: string,
): Promise<boolean> => {
  const hasData = await hasAnyScore(projectId);
  if (!hasData) {
    return false;
  }

  const query = `
    DELETE FROM scores
    WHERE project_id = {projectId: String};
  `;
  const tags = {
    feature: "tracing",
    type: "score",
    kind: "delete",
    projectId,
  };

  await commandClickhouse({
    query,
    params: { projectId },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags,
  });

  return true;
};

export const hasAnyScoreOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const query = `
    SELECT 1
    FROM scores
    WHERE project_id = {projectId: String}
    AND timestamp < {cutoffDate: DateTime64(3)}
    LIMIT 1
  `;

  const rows = await queryClickhouse<{ 1: number }>({
    query,
    params: {
      projectId,
      cutoffDate: convertDateToClickhouseDateTime(beforeDate),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "hasAnyOlderThan",
      projectId,
    },
  });

  return rows.length > 0;
};

export const deleteScoresOlderThanDays = async (
  projectId: string,
  beforeDate: Date,
): Promise<boolean> => {
  const hasData = await hasAnyScoreOlderThan(projectId, beforeDate);
  if (!hasData) {
    return false;
  }

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

  return true;
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

  return measureAndReturn({
    operationName: "getNumericScoreHistogram",
    projectId,
    input: {
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
        operation_name: "getNumericScoreHistogram",
      },
    },
    fn: async (input) => {
      return queryClickhouse<{ value: number }>({
        query,
        params: input.params,
        tags: input.tags,
      });
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
      s.timestamp,
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
    AND s.data_type IN ({dataTypes: Array(String)})
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
      dataTypes: AGGREGATABLE_SCORE_TYPES,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "analytic",
      projectId,
    },
  });

  return rows.map((row) => ({
    ...convertScoreAggregation<AggregatableScoreDataType>(row),
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
    AND data_type IN ({dataTypes: Array(String)})
    GROUP BY project_id
  `;

  const rows = await queryClickhouse<{ project_id: string; count: string }>({
    query,
    params: {
      start: convertDateToClickhouseDateTime(start),
      end: convertDateToClickhouseDateTime(end),
      dataTypes: AGGREGATABLE_SCORE_TYPES,
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
    AND s.data_type IN ({dataTypes: Array(String)})
  `;

  const rows = await queryClickhouse<{ name: string }>({
    query,
    params: {
      projectId,
      cutoffCreatedAt: convertDateToClickhouseDateTime(cutoffCreatedAt),
      dataTypes: AGGREGATABLE_SCORE_TYPES,
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
    AND data_type IN ({dataTypes: Array(String)})
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
      dataTypes: AGGREGATABLE_SCORE_TYPES,
    },
    tags: {
      feature: "blobstorage",
      type: "score",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
  });

  return records;
};

export const getScoresForAnalyticsIntegrations = async function* (
  projectId: string,
  projectName: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  // Subtract 7d from minTimestamp to account for shift in query
  const traceTable = "traces";

  const query = `    SELECT
      s.id as id,
      s.timestamp as timestamp,
      s.name as name,
      s.value as value,
      s.string_value as string_value,
      s.data_type as data_type,
      s.comment as comment,
      s.environment as environment,
      s.trace_id as score_trace_id,
      s.session_id as score_session_id,
      s.dataset_run_id as score_dataset_run_id,
      t.id as trace_id,
      t.name as trace_name,
      t.session_id as trace_session_id,
      t.user_id as trace_user_id,
      t.release as trace_release,
      t.tags as trace_tags,
      s.metadata as metadata,
      t.metadata['$posthog_session_id'] as posthog_session_id,
      t.metadata['$mixpanel_session_id'] as mixpanel_session_id
    FROM scores s FINAL
    LEFT JOIN ${traceTable} t FINAL ON s.trace_id = t.id AND s.project_id = t.project_id
    WHERE s.project_id = {projectId: String}
    AND s.timestamp >= {minTimestamp: DateTime64(3)}
    AND s.timestamp <= {maxTimestamp: DateTime64(3)}
    AND s.data_type IN ({dataTypes: Array(String)})
    AND (
      s.trace_id IS NOT NULL
      OR s.session_id IS NOT NULL
      OR s.dataset_run_id IS NOT NULL
    )
    AND (
      t.project_id = '' -- use the default value for the string type to filter for absence
      OR (
        t.project_id = {projectId: String}
        AND t.timestamp >= {minTimestamp: DateTime64(3)} - INTERVAL 7 DAY
        AND t.timestamp <= {maxTimestamp: DateTime64(3)}
      )
    )
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
      dataTypes: AGGREGATABLE_SCORE_TYPES,
    },
    tags: {
      feature: "posthog",
      type: "score",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
      clickhouse_settings: {
        join_algorithm: "grace_hash",
        grace_hash_join_initial_buckets: "32",
      },
    },
  });

  const baseUrl = env.NEXTAUTH_URL?.replace("/api/auth", "");
  for await (const record of records) {
    // Determine the effective session_id based on score attachment
    const effectiveSessionId =
      record.score_session_id || record.trace_session_id;

    // Determine the effective trace_id (could be null for session-only or dataset-run-only scores)
    const effectiveTraceId = record.score_trace_id || null;

    yield {
      timestamp: record.timestamp,
      langfuse_score_name: record.name,
      langfuse_score_value: record.value,
      langfuse_score_comment: record.comment,
      langfuse_score_metadata: record.metadata,
      langfuse_score_string_value: record.string_value,
      langfuse_score_data_type: record.data_type,
      langfuse_trace_name: record.trace_name,
      langfuse_trace_id: effectiveTraceId,
      langfuse_user_url: record.trace_user_id
        ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.trace_user_id as string)}`
        : undefined,
      langfuse_id: record.id,
      langfuse_session_id: effectiveSessionId,
      langfuse_project_id: projectId,
      langfuse_project_name: projectName,
      langfuse_user_id: record.trace_user_id || null,
      langfuse_release: record.trace_release,
      langfuse_tags: record.trace_tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      langfuse_score_entity_type: record.score_trace_id
        ? "trace"
        : record.score_session_id
          ? "session"
          : record.score_dataset_run_id
            ? "dataset_run"
            : "unknown",
      langfuse_dataset_run_id: record.score_dataset_run_id,
      posthog_session_id: record.posthog_session_id ?? null,
      mixpanel_session_id: record.mixpanel_session_id ?? null,
    } satisfies AnalyticsScoreEvent;
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

/**
 * Get score counts grouped by project and day within a date range.
 *
 * Returns one row per project per day with the count of scores created on that day.
 * Uses half-open interval [startDate, endDate) for filtering based on timestamp.
 *
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (exclusive)
 * @returns Array of { count, projectId, date } objects
 *
 * @example
 * // Get score counts for March 1-2, 2024
 * const counts = await getScoreCountsByProjectAndDay({
 *   startDate: new Date('2024-03-01T00:00:00Z'),
 *   endDate: new Date('2024-03-03T00:00:00Z')
 * });
 *
 * Note: Skips using FINAL (double counting risk) for faster and cheaper
 * queries against clickhouse. Generous 4x overcompensation before blocking allows
 * for usage aggregation to be meaningful.
 *
 */
export const getScoreCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const query = `
    SELECT
      count(*) as count,
      project_id,
      toDate(timestamp) as date
    FROM scores
    WHERE timestamp >= {startDate: DateTime64(3)}
    AND timestamp < {endDate: DateTime64(3)}
    AND data_type IN ({dataTypes: Array(String)})
    GROUP BY project_id, toDate(timestamp)
  `;

  const rows = await queryClickhouse<{
    count: string;
    project_id: string;
    date: string;
  }>({
    query,
    params: {
      startDate: convertDateToClickhouseDateTime(startDate),
      endDate: convertDateToClickhouseDateTime(endDate),
      dataTypes: AGGREGATABLE_SCORE_TYPES,
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "analytic",
    },
  });

  return rows.map((row) => ({
    count: Number(row.count),
    projectId: row.project_id,
    date: row.date,
  }));
};
