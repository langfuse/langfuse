/**
 * Logic mirrors repositories/scores.ts (ClickHouse); syntax adapted for OceanBase.
 */
import {
  ScoreDataTypeType,
  ScoreDomain,
  ScoreSourceType,
  AGGREGATABLE_SCORE_TYPES,
} from "../../domain/scores";
import { DatabaseAdapterFactory } from "../database";
import { FilterList, orderByToClickhouseSql } from "../queries";
import { FilterCondition, FilterState, TimeFilter } from "../../types";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/oceanbase-sql/factory";
import { OrderByState } from "../../interfaces/orderBy";
import {
  dashboardColumnDefinitions,
  scoresTableUiColumnDefinitions,
} from "../tableMappings";
import {
  convertScoreAggregation,
  convertClickhouseScoreToDomain,
  ScoreAggregation,
} from "../repositories/scores_converters";
import { SCORE_TO_TRACE_OBSERVATIONS_INTERVAL } from "../repositories/constants";
import { convertDateToDateTime } from "../database";
import { ScoreRecordReadType } from "../repositories/definitions";
import { env } from "../../env";
import { _handleGetScoreById, _handleGetScoresByIds } from "./scores-utils";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import type { AnalyticsScoreEvent } from "../analytics-integrations/types";
import { recordDistribution } from "../instrumentation";
import { prisma } from "../../db";
import { measureAndReturn } from "../oceanbase/measureAndReturn";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";
import { cleanUndefinedValues } from "../../utils/oceanbase";

export const searchExistingAnnotationScore = async (
  projectId: string,
  observationId: string | null,
  traceId: string | null,
  sessionId: string | null,
  name: string | undefined,
  configId: string | undefined,
  dataType: ScoreDataTypeType,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  if (!name && !configId) {
    throw new Error("Either name or configId (or both) must be provided.");
  }

  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
      FROM scores s
      WHERE s.project_id = ?
      AND s.source = 'ANNOTATION'
      AND s.data_type = ?
      ${traceId ? `AND s.trace_id = ?` : "AND s.trace_id IS NULL"}
      ${observationId ? `AND s.observation_id = ?` : "AND s.observation_id IS NULL"}
      ${sessionId ? `AND s.session_id = ?` : "AND s.session_id IS NULL"}
      AND (
        FALSE
        ${name ? `OR s.name = ?` : ""}
        ${configId ? `OR s.config_id = ?` : ""}
      )
    ) ranked
    WHERE rn = 1
    ORDER BY \`event_ts\` DESC
    LIMIT 1
  `;

  const params: unknown[] = [projectId, dataType];
  if (traceId) params.push(traceId);
  if (observationId) params.push(observationId);
  if (sessionId) params.push(sessionId);
  if (name) params.push(name);
  if (configId) params.push(configId);

  const rows = await adapter.queryWithOptions<ScoreRecordReadType>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  await adapter.upsert({
    table: "scores",
    records: [cleanUndefinedValues(score) as ScoreRecordReadType],
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
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadata?: IncludeHasMetadata;
};

const formatMetadataSelect = (
  excludeMetadata: boolean,
  includeHasMetadata: boolean,
) => {
  if (excludeMetadata) {
    return [
      "ranked.id, ranked.project_id, ranked.environment, ranked.name, ranked.value, ranked.string_value, ranked.timestamp, ranked.source, ranked.data_type, ranked.comment, ranked.trace_id, ranked.session_id, ranked.observation_id, ranked.author_user_id, ranked.created_at, ranked.updated_at, ranked.event_ts, ranked.is_deleted, ranked.source, ranked.config_id, ranked.queue_id, ranked.dataset_run_id",
      includeHasMetadata
        ? "CASE WHEN JSON_LENGTH(JSON_KEYS(ranked.metadata)) > 0 THEN 1 ELSE 0 END AS has_metadata"
        : null,
    ]
      .filter((s) => s != null)
      .join(", ");
  }
  return [
    "ranked.*",
    includeHasMetadata
      ? "CASE WHEN JSON_LENGTH(JSON_KEYS(ranked.metadata)) > 0 THEN 1 ELSE 0 END AS has_metadata"
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
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const adapter = DatabaseAdapterFactory.getInstance();
  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);

  const query = `
      SELECT 
        ${select}
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
        FROM scores s
        WHERE s.project_id = ?
        AND s.session_id IN (${sessionIds.map(() => "?").join(", ")})
      ) ranked
      WHERE rn = 1
      ORDER BY \`event_ts\` DESC
      ${limit && offset ? `LIMIT ? OFFSET ?` : ""}
    `;

  const params: unknown[] = [projectId, ...sessionIds];
  if (limit && offset) {
    params.push(limit, offset);
  }

  const rows = await adapter.queryWithOptions<ScoreRecordReadType>({
    query: query,
    params,
    tags: {
      feature: "sessions",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => convertClickhouseScoreToDomain(row));
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
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const adapter = DatabaseAdapterFactory.getInstance();
  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);

  // Handle empty runIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const datasetRunIdCondition =
    runIds.length === 0
      ? "AND 1=0"
      : `AND s.dataset_run_id IN (${runIds.map(() => "?").join(", ")})`;

  const query = `
      SELECT 
        ${select}
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
        FROM scores s
        WHERE s.project_id = ?
        ${datasetRunIdCondition}
      ) ranked
      WHERE rn = 1
      ORDER BY \`event_ts\` DESC
      ${limit && offset ? `LIMIT ? OFFSET ?` : ""}
    `;

  const params: unknown[] = [projectId, ...runIds];
  if (limit && offset) {
    params.push(limit, offset);
  }

  const rows = await adapter.queryWithOptions<ScoreRecordReadType>({
    query: query,
    params,
    tags: {
      feature: "sessions",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => convertClickhouseScoreToDomain(row));
};

export const getTraceScoresForDatasetRuns = async (
  projectId: string,
  datasetRunIds: string[],
): Promise<Array<{ dataset_run_id: string } & any>> => {
  if (datasetRunIds.length === 0) return [];

  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty datasetRunIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const datasetRunIdCondition =
    datasetRunIds.length === 0
      ? "AND 1=0"
      : `AND dri.dataset_run_id IN (${datasetRunIds.map(() => "?").join(", ")})`;

  const query = `
    SELECT 
      ranked.id as id,
      ranked.timestamp as timestamp,
      ranked.project_id as project_id,
      ranked.environment as environment,
      ranked.trace_id as trace_id,
      ranked.session_id as session_id,
      ranked.observation_id as observation_id,
      ranked.dataset_run_id as dataset_run_id,
      ranked.name as name,
      ranked.value as value,
      ranked.source as source,
      ranked.comment as comment,
      ranked.author_user_id as author_user_id,
      ranked.config_id as config_id,
      ranked.data_type as data_type,
      ranked.string_value as string_value,
      ranked.queue_id as queue_id,
      ranked.created_at as created_at,
      ranked.updated_at as updated_at,
      ranked.event_ts as event_ts,
      ranked.is_deleted as is_deleted, 
      CASE WHEN JSON_LENGTH(JSON_KEYS(ranked.metadata)) > 0 THEN 1 ELSE 0 END AS has_metadata,
      ranked.dataset_run_id as run_id
    FROM (
      SELECT s.id, s.timestamp, s.project_id, s.environment, s.trace_id, s.session_id, s.observation_id,
        s.name, s.value, s.source, s.comment, s.author_user_id, s.config_id, s.data_type,
        s.string_value, s.queue_id, s.created_at, s.updated_at, s.event_ts, s.is_deleted, s.metadata,
        dri.dataset_run_id,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id, dri.dataset_run_id ORDER BY s.event_ts DESC) as rn
      FROM dataset_run_items_rmt dri 
      JOIN scores s ON dri.trace_id = s.trace_id 
        AND dri.project_id = s.project_id
      WHERE dri.project_id = ?
        ${datasetRunIdCondition}
        AND s.project_id = ?
    ) ranked
    WHERE rn = 1
    ORDER BY \`event_ts\` DESC
  `;

  const params: unknown[] = [projectId, ...datasetRunIds, projectId];

  const rows = await adapter.queryWithOptions<
    Omit<ScoreRecordReadType, "metadata"> & {
      has_metadata: 0 | 1;
      run_id: string;
    }
  >({
    query,
    params,
    tags: {
      feature: "dataset-run-items",
      type: "trace-scores",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => ({
    ...convertClickhouseScoreToDomain({ ...row, metadata: {} }),
    datasetRunId: row.run_id,
    hasMetadata: !!Number(row.has_metadata),
  }));
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
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const adapter = DatabaseAdapterFactory.getInstance();
  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);

  // Handle empty traceIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const traceIdCondition =
    traceIds.length === 0
      ? "AND 1=0"
      : `AND s.trace_id IN (${traceIds.map(() => "?").join(", ")})`;

  const query = `
      SELECT
        ${select}
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
        FROM scores s
        WHERE s.project_id = ?
        ${traceIdCondition}
        ${timestamp ? `AND s.timestamp >= DATE_SUB(?, ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL})` : ""}
      ) ranked
      WHERE rn = 1
      ORDER BY \`event_ts\` DESC
      ${limit && offset ? `LIMIT ? OFFSET ?` : ""}
    `;

  const params: unknown[] = [projectId, ...traceIds];
  if (timestamp) {
    params.push(convertDateToDateTime(timestamp));
  }
  if (limit && offset) {
    params.push(limit, offset);
  }

  const rows = await adapter.queryWithOptions<
    ScoreRecordReadType & {
      metadata: ExcludeMetadata extends true
        ? never
        : ScoreRecordReadType["metadata"];
      // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
      has_metadata: IncludeHasMetadata extends true ? 0 | 1 : never;
    }
  >({
    query: query,
    params,
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => {
    const score = convertClickhouseScoreToDomain({
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
      Object.assign(score, { hasMetadata: !!Number(row.has_metadata) });
    }

    return score;
  });
};

export const getScoresAndCorrectionsForTraces = async <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForTracesProps<ExcludeMetadata, IncludeHasMetadata>,
) => {
  return getScoresForTraces(props);
};

export type GetScoresForObservationsProps<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
> = {
  projectId: string;
  observationIds: string[];
  limit?: number;
  offset?: number;
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
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;

  const adapter = DatabaseAdapterFactory.getInstance();
  const select = formatMetadataSelect(excludeMetadata, includeHasMetadata);
  const observationIdsArray = observationIds || [];
  const observationIdsCondition =
    observationIdsArray.length > 0
      ? `AND s.observation_id IN (${observationIdsArray.map(() => "?").join(", ")})`
      : "AND 1=0";

  const query = `
      SELECT 
        ${select}
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
        FROM scores s
        WHERE s.project_id = ?
        ${observationIdsCondition}
      ) ranked
      WHERE rn = 1
      ORDER BY \`event_ts\` DESC
      ${limit !== undefined && offset !== undefined ? `LIMIT ? OFFSET ?` : ""}
    `;

  const params: unknown[] = [
    projectId,
    ...(observationIdsArray.length > 0 ? observationIdsArray : []),
  ];
  if (limit !== undefined && offset !== undefined) {
    params.push(limit, offset);
  }

  const rows = await adapter.queryWithOptions<
    ScoreRecordReadType & {
      metadata: ExcludeMetadata extends true
        ? never
        : ScoreRecordReadType["metadata"];
      // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
      has_metadata: IncludeHasMetadata extends true ? 0 | 1 : never;
    }
  >({
    query: query,
    params,
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => ({
    ...convertClickhouseScoreToDomain({
      ...row,
      metadata: excludeMetadata ? {} : row.metadata,
    }),
    hasMetadata: (includeHasMetadata
      ? !!Number(row.has_metadata)
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

  const adapter = DatabaseAdapterFactory.getInstance();
  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT 
      name,
      source,
      data_type
    FROM scores s
    WHERE s.project_id = ?
    ${timestamp ? `AND s.timestamp >= ?` : ""}
    AND s.dataset_run_id IN (${datasetRunIds.map(() => "?").join(", ")})
    GROUP BY name, source, data_type
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const params: unknown[] = [projectId];
  if (timestamp) {
    params.push(convertDateToDateTime(timestamp));
  }
  params.push(...datasetRunIds);

  const rows = await adapter.queryWithOptions<{
    name: string;
    source: string;
    data_type: string;
  }>({
    query: query,
    params,
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
    dataType: row.data_type as ScoreDataTypeType,
  }));
};

export const getScoresGroupedByNameSourceType = async (
  projectId: string,
  timestamp: Date | undefined,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
    SELECT 
      name,
      source,
      data_type
    FROM scores s
    WHERE s.project_id = ?
    ${timestamp ? `AND s.timestamp >= ?` : ""}
    GROUP BY name, source, data_type
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const params: unknown[] = [projectId];
  if (timestamp) {
    params.push(convertDateToDateTime(timestamp));
  }

  const rows = await adapter.queryWithOptions<{
    name: string;
    source: string;
    data_type: string;
  }>({
    query: query,
    params,
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
    dataType: row.data_type as ScoreDataTypeType,
  }));
};

export const getNumericScoresGroupedByName = async (
  projectId: string,
  timestampFilter?: FilterState,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
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
  let filterQuery = timestampFilterRes?.query || "";
  let filterParams: unknown[] = [];
  if (timestampFilterRes) {
    const converted = convertFilterParamsToPositional(
      timestampFilterRes.query,
      timestampFilterRes.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  const query = `
      SELECT 
        name as name
      FROM scores s
      WHERE s.project_id = ?
      AND s.data_type IN ('NUMERIC', 'BOOLEAN')
      ${filterQuery ? `AND ${filterQuery}` : ""}
      GROUP BY name
      ORDER BY count(*) DESC
      LIMIT 1000
    `;

  const params: unknown[] = [projectId, ...filterParams];

  const rows = await adapter.queryWithOptions<{
    name: string;
  }>({
    query: query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
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

  let filterQuery = timestampFilterRes?.query || "";
  let filterParams: unknown[] = [];
  if (timestampFilterRes) {
    const converted = convertFilterParamsToPositional(
      timestampFilterRes.query,
      timestampFilterRes.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  const query = `
    SELECT
      name AS label,
      GROUP_CONCAT(DISTINCT string_value ORDER BY string_value SEPARATOR ',') AS value_list
    FROM scores s
    WHERE s.project_id = ?
    AND s.data_type = 'CATEGORICAL'
    ${filterQuery ? `AND ${filterQuery}` : ""}
    GROUP BY name
    ORDER BY count(*) DESC
    LIMIT 1000
  `;

  const params: unknown[] = [projectId, ...filterParams];

  const rows = await adapter.queryWithOptions<{
    label: string;
    value_list: string;
  }>({
    query: query,
    params,
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

      // Parse comma-separated values from MySQL GROUP_CONCAT
      const actualValues = row.value_list ? row.value_list.split(",") : [];

      // Merge actual values from database with all possible values from config
      // Use Set to ensure uniqueness
      const mergedValues = Array.from(
        new Set([...actualValues, ...allPossibleValues]),
      );

      return {
        label: row.label,
        values: mergedValues,
      };
    }

    // If no config found, return original values (split comma-separated string)
    return {
      label: row.label,
      values: row.value_list ? row.value_list.split(",") : [],
    };
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
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadataFlag?: IncludeHasMetadata;
}) {
  const {
    excludeMetadata = false,
    includeHasMetadataFlag = false,
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
    config_id: string | null;
    queue_id: string | null;
    execution_trace_id: string | null;
    is_deleted: number;
    event_ts: string;
    created_at: string;
    updated_at: string;
    // has_metadata is 0 or 1 from DB, later converted to a boolean
    has_metadata: IncludeHasMetadata extends true ? 0 | 1 : never;
  }>({
    select: "rows",
    tags: { kind: "analytic" },
    excludeMetadata,
    includeHasMetadataFlag,
    ...rest,
  });

  const includeMetadataPayload = excludeMetadata ? false : true;
  return rows.map((row) => {
    const score = convertClickhouseScoreToDomain(
      {
        ...row,
        metadata: excludeMetadata ? {} : row.metadata,
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
  excludeMetadata?: boolean;
  includeHasMetadataFlag?: boolean;
}): Promise<T[]> => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const {
    projectId,
    filter,
    orderBy,
    limit,
    offset,
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
        s.\`name\`,
        s.\`value\`,
        s.string_value,
        s.\`timestamp\`,
        s.source,
        s.data_type,
        s.\`comment\`,
        ${excludeMetadata ? "" : "s.metadata,"}
        s.trace_id,
        s.session_id,
        s.observation_id,
        s.dataset_run_id,
        s.author_user_id,
        t.user_id,
        t.\`name\`,
        t.tags,
        s.created_at,
        s.updated_at,
        s.source,
        s.config_id,
        s.queue_id,
        s.execution_trace_id,
        s.is_deleted,
        s.\`event_ts\`,
        t.user_id,
        t.\`name\` as trace_name,
        t.tags as trace_tags
        ${includeHasMetadataFlag ? ",CASE WHEN JSON_LENGTH(JSON_KEYS(s.metadata)) > 0 THEN 1 ELSE 0 END AS has_metadata" : ""}
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

  // Convert filter query and params for OceanBase
  let filterQuery = scoresFilterRes?.query || "";
  let filterParams: unknown[] = [];
  if (scoresFilterRes) {
    const converted = convertFilterParamsToPositional(
      scoresFilterRes.query,
      scoresFilterRes.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;

    // Add table aliases to columns in filterQuery to avoid ambiguity
    // This handles cases where filterQuery contains columns without table aliases
    // Replace common column names that might appear without aliases
    const columnMap: Record<string, string> = {
      project_id: "s.project_id",
      timestamp: "s.timestamp",
      environment: "s.environment",
      name: "s.name",
      source: "s.source",
      data_type: "s.data_type",
      trace_id: "s.trace_id",
      observation_id: "s.observation_id",
      session_id: "s.session_id",
      value: "s.value",
      string_value: "s.string_value",
      comment: "s.comment",
      author_user_id: "s.author_user_id",
      config_id: "s.config_id",
      queue_id: "s.queue_id",
      dataset_run_id: "s.dataset_run_id",
    };

    // Only replace if the column name is not already prefixed with a table alias
    for (const [col, aliasedCol] of Object.entries(columnMap)) {
      // Match column names that are not already prefixed (not like "s.project_id" or "t.project_id")
      // Use negative lookbehind to avoid matching columns that already have a table prefix like "t.name"
      const pattern = new RegExp(
        `(?<![a-zA-Z_.])(\\b${col}\\b)(?![a-zA-Z_])`,
        "g",
      );
      filterQuery = filterQuery.replace(pattern, aliasedCol);
    }
  }

  const dataTypePlaceholders = AGGREGATABLE_SCORE_TYPES.map(() => "?").join(
    ", ",
  );
  const query = `
      SELECT 
          ${select}
      FROM scores s
      ${performTracesJoin ? "LEFT JOIN __TRACE_TABLE__ t ON s.trace_id = t.id AND t.project_id = s.project_id" : ""}
      WHERE s.project_id = ?
      AND s.data_type IN (${dataTypePlaceholders})
      ${filterQuery ? `AND ${filterQuery}` : ""}
      ${orderByToClickhouseSql(orderBy ?? null, scoresTableUiColumnDefinitions)}
      ${limit !== undefined && offset !== undefined ? `LIMIT ? OFFSET ?` : ""}
    `;

  const params: unknown[] = [
    projectId,
    ...AGGREGATABLE_SCORE_TYPES,
    ...filterParams,
  ];
  if (limit !== undefined && offset !== undefined) {
    params.push(limit, offset);
  }

  return measureAndReturn({
    operationName: "getScoresUiGeneric",
    projectId,
    input: {
      params,
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
      return adapter.queryWithOptions<T>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params as unknown[],
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
  });
};

export const getScoreNames = async (
  projectId: string,
  timestampFilter: FilterState,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const chFilter = new FilterList(
    createFilterFromFilterState(
      timestampFilter,
      scoresTableUiColumnDefinitions,
    ),
  );
  const timestampFilterRes = chFilter.apply();

  // Convert filter query and params for OceanBase
  let filterQuery = timestampFilterRes?.query || "";
  let filterParams: unknown[] = [];
  if (timestampFilterRes) {
    const converted = convertFilterParamsToPositional(
      timestampFilterRes.query,
      timestampFilterRes.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  // We mainly use queries like this to retrieve filter options.
  // Therefore, we can skip final as some inaccuracy in count is acceptable.
  const query = `
      SELECT 
        name,
        count(*) as count
      FROM scores s
      WHERE s.project_id = ?
      ${filterQuery ? `AND ${filterQuery}` : ""}
      GROUP BY name
      ORDER BY count(*) DESC
      LIMIT 1000
    `;

  const params: unknown[] = [projectId, ...filterParams];

  const rows = await adapter.queryWithOptions<{
    name: string;
    count: string;
  }>({
    query: query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const chFilter = new FilterList(
    createFilterFromFilterState(
      timestampFilter,
      scoresTableUiColumnDefinitions,
    ),
  );
  const timestampFilterRes = chFilter.apply();

  let filterQuery = timestampFilterRes?.query || "";
  let filterParams: unknown[] = [];
  if (timestampFilterRes?.query && timestampFilterRes?.params) {
    const converted = convertFilterParamsToPositional(
      timestampFilterRes.query,
      timestampFilterRes.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;
  }

  const query = `
      SELECT
        string_value,
        count(*) as count
      FROM scores s
      WHERE s.project_id = ?
      AND s.string_value IS NOT NULL
      AND s.string_value != ''
      ${filterQuery ? `AND ${filterQuery}` : ""}
      GROUP BY string_value
      ORDER BY count(*) DESC
      LIMIT 1000
    `;

  const params: unknown[] = [projectId, ...filterParams];

  const rows = await adapter.queryWithOptions<{
    string_value: string;
    count: string;
  }>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty scoreIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const scoreIdCondition =
    scoreIds.length === 0
      ? "AND 1=0"
      : `AND id IN (${scoreIds.map(() => "?").join(", ")})`;

  const query = `
    DELETE FROM scores
    WHERE project_id = ?
    ${scoreIdCondition}
  `;
  await adapter.commandWithOptions({
    query: query,
    params: [projectId, ...scoreIds],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty traceIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const traceIdCondition =
    traceIds.length === 0
      ? "AND 1=0"
      : `AND trace_id IN (${traceIds.map(() => "?").join(", ")})`;

  const query = `
    DELETE FROM scores
    WHERE project_id = ?
    ${traceIdCondition}
  `;
  await adapter.commandWithOptions({
    query: query,
    params: [projectId, ...traceIds],
    tags: {
      feature: "tracing",
      type: "score",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteScoresByProjectId = async (projectId: string) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    DELETE FROM scores
    WHERE project_id = ?
  `;
  await adapter.commandWithOptions({
    query: query,
    params: [projectId],
    tags: {
      feature: "tracing",
      type: "score",
      kind: "delete",
      projectId,
    },
  });
};

export const hasAnyScoreOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 1
    FROM scores
    WHERE project_id = ?
    AND timestamp < ?
    LIMIT 1
  `;

  const rows = await adapter.queryWithOptions<{ 1: number }>({
    query,
    params: [projectId, adapter.convertDateToDateTime(beforeDate)],
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

  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    DELETE FROM scores
    WHERE project_id = ?
    AND timestamp < ?
  `;
  await adapter.commandWithOptions({
    query,
    params: [projectId, adapter.convertDateToDateTime(beforeDate)],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  );
  const chFilterRes = chFilter.apply();

  const traceFilter = chFilter.find((f) => f.clickhouseTable === "traces");

  // Convert filter query and params for OceanBase
  let filterQuery = chFilterRes?.query || "";
  let filterParams: unknown[] = [];
  if (chFilterRes) {
    const converted = convertFilterParamsToPositional(
      chFilterRes.query,
      chFilterRes.params,
    );
    filterQuery = converted.query;
    filterParams = converted.params;

    // Add table aliases to columns in filterQuery to avoid ambiguity
    // This is needed because both scores and traces tables may have similar columns
    const columnMap: Record<string, string> = {
      project_id: "s.project_id",
      timestamp: "s.timestamp",
      environment: "s.environment",
      name: "s.name",
      source: "s.source",
      data_type: "s.data_type",
      trace_id: "s.trace_id",
      observation_id: "s.observation_id",
      session_id: "s.session_id",
      value: "s.value",
      string_value: "s.string_value",
      comment: "s.comment",
      author_user_id: "s.author_user_id",
      config_id: "s.config_id",
      queue_id: "s.queue_id",
      dataset_run_id: "s.dataset_run_id",
    };

    // Only replace if the column name is not already prefixed with a table alias
    for (const [col, aliasedCol] of Object.entries(columnMap)) {
      // Match column names that are not already prefixed (not like "s.project_id" or "t.project_id")
      // Use negative lookbehind to avoid matching columns that already have a table prefix
      // Also exclude backtick ` to avoid matching t.`name`
      const pattern = new RegExp(
        `(?<![a-zA-Z_.\`])(\\b${col}\\b)(?![a-zA-Z_])`,
        "g",
      );
      filterQuery = filterQuery.replace(pattern, aliasedCol);
    }
  }

  const query = `
    SELECT ranked.value
    FROM (
      SELECT s.*,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
      FROM scores s
      ${traceFilter ? `LEFT JOIN __TRACE_TABLE__ t ON s.trace_id = t.id AND t.project_id = s.project_id` : ""}
      WHERE s.project_id = ?
      ${traceFilter ? `AND t.project_id = ?` : ""}
      ${filterQuery ? `AND ${filterQuery}` : ""}
    ) ranked
    WHERE rn = 1
    ORDER BY \`event_ts\` DESC
    ${limit !== undefined ? `LIMIT ?` : ""}
  `;

  // Extract timestamp from filter for AMT table selection
  const timestampFilter = chFilter.find(
    (f) => f.clickhouseTable === "traces" && f.field === "timestamp",
  ) as TimeFilter | undefined;
  const timestamp = timestampFilter?.value;

  const params: unknown[] = [projectId];
  if (traceFilter) {
    params.push(projectId);
  }
  params.push(...filterParams);
  if (limit !== undefined) {
    params.push(limit);
  }

  return measureAndReturn({
    operationName: "getNumericScoreHistogram",
    projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "score",
        kind: "analytic",
        projectId,
        operation_name: "getNumericScoreHistogram",
      },
      timestamp,
    },
    fn: async (input) => {
      return adapter.queryWithOptions<{ value: number }>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params as unknown[],
        tags: { ...input.tags, experiment_amt: "original" },
      });
    },
  });
};

export const getAggregatedScoresForPrompts = async (
  projectId: string,
  promptIds: string[],
  fetchScoreRelation: "observation" | "trace",
) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  // Handle empty promptIds array by using 1=0 condition to avoid SQL syntax error with IN ()
  const promptIdCondition =
    promptIds.length === 0
      ? "AND 1=0"
      : `AND o.prompt_id IN (${promptIds.map(() => "?").join(", ")})`;

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
      CASE WHEN JSON_LENGTH(JSON_KEYS(s.metadata)) > 0 THEN 1 ELSE 0 END AS has_metadata
    FROM scores s LEFT JOIN observations o 
      ON o.trace_id = s.trace_id 
      AND o.project_id = s.project_id 
      ${fetchScoreRelation === "observation" ? "AND o.id = s.observation_id" : ""}
    WHERE o.project_id = ?
    AND s.project_id = ?
    ${promptIdCondition}
    AND o.type = 'GENERATION'
    AND s.name IS NOT NULL
    ${fetchScoreRelation === "trace" ? "AND s.observation_id IS NULL" : ""}
  `;

  const params: unknown[] = [projectId, projectId, ...promptIds];

  const rows = await adapter.queryWithOptions<
    ScoreAggregation & {
      prompt_id: string;
      // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
      has_metadata: 0 | 1;
    }
  >({
    query,
    params,
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
    hasMetadata: !!Number(row.has_metadata),
  }));
};

export const getScoreCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 
      project_id,
      count(*) as count
    FROM scores
    WHERE created_at >= ?
    AND created_at < ?
    GROUP BY project_id
  `;

  const params: unknown[] = [
    convertDateToDateTime(start),
    convertDateToDateTime(end),
  ];

  const rows = await adapter.queryWithOptions<{
    project_id: string;
    count: string;
  }>({
    query,
    params,
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const projectIdsPlaceholders =
    projectIds.length > 0 ? projectIds.map(() => "?").join(", ") : "NULL";
  const projectIdsCondition =
    projectIds.length > 0 ? `project_id IN (${projectIdsPlaceholders})` : "1=0";

  const query = `
    SELECT 
      count(*) as count
    FROM scores
    WHERE ${projectIdsCondition}
    AND created_at >= ?
  `;

  const params: unknown[] = [
    ...(projectIds.length > 0 ? projectIds : []),
    convertDateToDateTime(start),
  ];

  const rows = await adapter.queryWithOptions<{ count: string }>({
    query,
    params,
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
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const { projectId, cutoffCreatedAt, filter, isTimestampFilter } = p;
  const scoreTimestampFilter = filter?.find(isTimestampFilter);

  const query = `
    SELECT DISTINCT
      name
    FROM scores s 
    WHERE s.project_id = ?
    AND s.created_at <= ?
    ${scoreTimestampFilter ? `AND s.timestamp >= ?` : ""}
  `;

  const params: unknown[] = [projectId, convertDateToDateTime(cutoffCreatedAt)];
  if (scoreTimestampFilter) {
    params.push(convertDateToDateTime(scoreTimestampFilter.value));
  }

  const rows = await adapter.queryWithOptions<{ name: string }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "score",
      kind: "list",
      projectId,
    },
  });

  return rows.map((row) => row.name);
};

export const getScoresForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const adapter = DatabaseAdapterFactory.getInstance();
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
    FROM scores
    WHERE project_id = ?
    AND timestamp >= ?
    AND timestamp <= ?
  `;

  const params: unknown[] = [
    projectId,
    convertDateToDateTime(minTimestamp),
    convertDateToDateTime(maxTimestamp),
  ];

  const records = adapter.queryStreamWithOptions<Record<string, unknown>>({
    query,
    params,
    tags: {
      feature: "blobstorage",
      type: "score",
      kind: "analytic",
      projectId,
    },
  });

  return records;
};

export const getScoresForAnalyticsIntegrations = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const traceTable = "traces";
  const adapter = DatabaseAdapterFactory.getInstance();
  const minTs = adapter.convertDateToDateTime(minTimestamp);
  const maxTs = adapter.convertDateToDateTime(maxTimestamp);

  // Mirror CH: scores FINAL + traces FINAL, 7d trace window, filter by trace_id OR session_id OR dataset_run_id
  const query = `
    SELECT
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
      t.\`release\` as trace_release,
      t.tags as trace_tags,
      s.metadata as metadata,
      JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.$posthog_session_id')) as posthog_session_id,
      JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.$mixpanel_session_id')) as mixpanel_session_id
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM scores
    ) s
    LEFT JOIN (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
      FROM ${traceTable}
    ) t ON s.trace_id = t.id AND s.project_id = t.project_id AND t.rn = 1
    WHERE s.rn = 1
    AND s.project_id = ?
    AND s.timestamp >= ?
    AND s.timestamp <= ?
    AND s.data_type IN (${AGGREGATABLE_SCORE_TYPES.map(() => "?").join(", ")})
    AND (
      s.trace_id IS NOT NULL
      OR s.session_id IS NOT NULL
      OR s.dataset_run_id IS NOT NULL
    )
    AND (
      t.project_id IS NULL
      OR t.project_id = ''
      OR (
        t.project_id = ?
        AND t.timestamp >= DATE_SUB(?, INTERVAL 7 DAY)
        AND t.timestamp <= ?
      )
    )
  `;

  const params: unknown[] = [
    projectId,
    minTs,
    maxTs,
    ...AGGREGATABLE_SCORE_TYPES,
    projectId,
    minTs,
    maxTs,
  ];

  const records = adapter.queryStreamWithOptions<Record<string, unknown>>({
    query,
    params,
    tags: {
      feature: "posthog",
      type: "score",
      kind: "analytic",
      projectId,
    },
  });

  const baseUrl = env.NEXTAUTH_URL?.replace("/api/auth", "");
  for await (const record of records) {
    const effectiveSessionId =
      record.score_session_id || record.trace_session_id;
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 1
    FROM scores
    WHERE project_id = ?
    LIMIT 1
  `;

  const rows = await adapter.queryWithOptions<{ 1: number }>({
    query,
    params: [projectId],
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
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT 
      metadata
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
      FROM scores s
      WHERE s.project_id = ?
      AND s.id = ?
      ${source ? `AND s.source = ?` : ""}
    ) ranked
    WHERE rn = 1
    LIMIT 1
  `;

  const params: unknown[] = [projectId, id];
  if (source !== undefined) {
    params.push(source);
  }

  const rows = await adapter.queryWithOptions<
    Pick<ScoreRecordReadType, "metadata">
  >({
    query,
    params,
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
 * Uses half-open interval [startDate, endDate) for filtering.
 */
export const getScoreCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const query = `
    SELECT
      count(*) as count,
      project_id,
      DATE(timestamp) as date
    FROM scores
    WHERE timestamp >= ?
    AND timestamp < ?
    AND data_type IN (${AGGREGATABLE_SCORE_TYPES.map(() => "?").join(", ")})
    GROUP BY project_id, DATE(timestamp)
  `;

  const rows = await adapter.queryWithOptions<{
    count: string;
    project_id: string;
    date: string;
  }>({
    query,
    params: [
      adapter.convertDateToDateTime(startDate),
      adapter.convertDateToDateTime(endDate),
      ...AGGREGATABLE_SCORE_TYPES,
    ],
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
