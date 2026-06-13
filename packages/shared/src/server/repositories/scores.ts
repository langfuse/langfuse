import { z } from "zod";
import {
  ScoreDataTypeType,
  ScoreDomain,
  ScoreSourceType,
  AggregatableScoreDataType,
  ScoreByDataType,
  LISTABLE_SCORE_TYPES,
  ScoreDataTypeEnum,
} from "../../domain/scores";
import { InvalidRequestError, InternalServerError } from "../../errors";
import type { APIScoreV3 } from "../../features/scores/interfaces/api/v3/schemas";
import type { ScoreFieldGroupV3 } from "../../features/scores/interfaces/api/v3/endpoints";
import { filterAndValidateV3GetScoreList } from "../../features/scores/interfaces/api/v3/validation";
import {
  commandClickhouse,
  queryClickhouse,
  queryClickhouseStream,
  parseClickhouseUTCDateTimeFormat,
  clickhouseCompliantRandomCharacters,
} from "./clickhouse";
import {
  FilterList,
  orderByToClickhouseSql,
  StringOptionsFilter,
  DateTimeFilter,
  NumberFilter,
} from "../queries";
import { FilterCondition, FilterState, TimeFilter } from "../../types";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-sql/factory";
import { OrderByState } from "../../interfaces/orderBy";
import { scoresTableUiColumnDefinitionsFromEvents } from "../tableMappings";
import { convertClickhouseScoreToDomain } from "./scores_converters";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import { ScoreRecordReadType } from "./definitions";
import { env } from "../../env";
import { _handleGetScoreById, _handleGetScoresByIds } from "./scores-utils";
import type { AnalyticsScoreEvent } from "../analytics-integrations/types";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { logger } from "../logger";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { eventsTraceMetadata } from "../queries/clickhouse-sql/query-fragments";
import { scoresTableCols } from "../../tableDefinitions/scoresTable";
import {
  findUiColumnMapping,
  matchesUiColumnMapping,
} from "../../tableDefinitions";
import * as greptimeScoreReads from "./greptime/scores";
import { upsertScoreToGreptime } from "./greptime/mutations";

export const searchExistingAnnotationScore = (
  projectId: string,
  observationId: string | null,
  traceId: string | null,
  sessionId: string | null,
  name: string | undefined,
  configId: string | undefined,
  dataType: ScoreDataTypeType,
) =>
  greptimeScoreReads.searchExistingAnnotationScore(
    projectId,
    observationId,
    traceId,
    sessionId,
    name,
    configId,
    dataType,
  );

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
    dataTypes: LISTABLE_SCORE_TYPES,
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
  await upsertScoreToGreptime(score);
};

export type GetScoresForTracesProps<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
> = {
  projectId: string;
  traceIds: string[];
  level?: "trace" | "observation" | "all";
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

type GetScoresForExperimentsProps<
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

export const getScoresForSessions = <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForSessionsProps<ExcludeMetadata, IncludeHasMetadata>,
) => greptimeScoreReads.getScoresForSessions(props);

export const getScoresForExperiments = <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForExperimentsProps<ExcludeMetadata, IncludeHasMetadata>,
) =>
  greptimeScoreReads.getScoresForExperiments(props) as unknown as Promise<
    ScoreByDataType<AggregatableScoreDataType>[]
  >;

export const getTraceScoresForDatasetRuns = (
  projectId: string,
  datasetRunIds: string[],
): Promise<Array<{ datasetRunId: string } & any>> =>
  greptimeScoreReads.getTraceScoresForDatasetRuns(projectId, datasetRunIds);

export const getScoresForExperimentItems = (
  projectId: string,
  experimentIds: string[],
): Promise<
  Array<
    ScoreByDataType<AggregatableScoreDataType> & {
      experimentId: string;
      hasMetadata: boolean;
    }
  >
> =>
  greptimeScoreReads.getScoresForExperimentItems(
    projectId,
    experimentIds,
  ) as unknown as Promise<
    Array<
      ScoreByDataType<AggregatableScoreDataType> & {
        experimentId: string;
        hasMetadata: boolean;
      }
    >
  >;

// Used in multiple places, including the public API, hence the non-default exclusion of metadata via excludeMetadata flag
export const getScoresForTraces = <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForTracesProps<ExcludeMetadata, IncludeHasMetadata>,
) => greptimeScoreReads.getScoresForTraces(props);

export const getScoresAndCorrectionsForTraces = <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForTracesProps<ExcludeMetadata, IncludeHasMetadata>,
) => greptimeScoreReads.getScoresAndCorrectionsForTraces(props);

export type GetScoresForObservationsProps<
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
> = {
  projectId: string;
  observationIds: string[];
  /**
   * When provided, adds `AND s.timestamp >= minTimestamp - SCORE_TO_TRACE_OBSERVATIONS_INTERVAL`
   * to the query so ClickHouse can prune monthly partitions and avoid full-table scans.
   * Pass the minimum startTime of the observations whose scores you are fetching.
   */
  minTimestamp?: Date;
  limit?: number;
  offset?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions;
  excludeMetadata?: ExcludeMetadata;
  includeHasMetadata?: IncludeHasMetadata;
};

// Currently only used from the observations table, hence the exclusion of metadata without excludeMetadata flag
export const getScoresForObservations = <
  ExcludeMetadata extends boolean,
  IncludeHasMetadata extends boolean,
>(
  props: GetScoresForObservationsProps<ExcludeMetadata, IncludeHasMetadata>,
) =>
  greptimeScoreReads.getScoresForObservations(props) as unknown as Promise<
    Array<
      ScoreByDataType<ScoreDataTypeType> & {
        hasMetadata: IncludeHasMetadata extends true ? boolean : never;
      }
    >
  >;

export const getScoresGroupedByNameSourceType = (args: {
  projectId: string;
  filter: FilterCondition[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
}) => greptimeScoreReads.getScoresGroupedByNameSourceType(args);

export const getNumericScoresGroupedByName = (
  projectId: string,
  filter?: FilterState,
) => greptimeScoreReads.getNumericScoresGroupedByName(projectId, filter);

export const getCategoricalScoresGroupedByName = (
  projectId: string,
  filter?: FilterState,
) => greptimeScoreReads.getCategoricalScoresGroupedByName(projectId, filter);

export const getScoresUiCount = (props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
}) => greptimeScoreReads.getScoresUiCount(props);

export type ScoreUiTableRow = ScoreDomain & {
  traceName: string | null;
  traceUserId: string | null;
  traceTags: Array<string> | null;
};

export function getScoresUiTable<
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
  return greptimeScoreReads.getScoresUiTable({
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    offset: props.offset,
    excludeMetadata: props.excludeMetadata,
    includeHasMetadataFlag: props.includeHasMetadataFlag,
  }) as unknown as Promise<
    Array<
      ScoreUiTableRow & {
        hasMetadata: IncludeHasMetadata extends true ? boolean : never;
      }
    >
  >;
}

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
      scoresTableCols,
    ),
  );

  const scoreOnlyFilters = scoresFilter.filter(
    (f) => f.clickhouseTable !== "traces",
  );
  const scoreOnlyFilterRes = scoreOnlyFilters.apply();

  // Trace-level filter entries from the frontend filter state
  const traceFilterState = filter.filter((filterEntry) =>
    scoresTraceFilterEventsMapping.some((col) =>
      matchesUiColumnMapping(col, filterEntry.column),
    ),
  );

  const matchedOrderByColumn = orderBy
    ? findUiColumnMapping(
        scoresTableUiColumnDefinitionsFromEvents,
        orderBy.column,
      )
    : null;
  const orderByColumn =
    matchedOrderByColumn?.clickhouseTableName === "traces"
      ? matchedOrderByColumn
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
          scoresTableCols,
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
        dataTypes: LISTABLE_SCORE_TYPES,
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
        preferredClickhouseService: needsTracesCTE
          ? "EventsReadOnly"
          : "ReadOnly",
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

export const getScoreNames = (
  projectId: string,
  timestampFilter: FilterState,
) => greptimeScoreReads.getScoreNames(projectId, timestampFilter);

export const getScoreStringValues = (
  projectId: string,
  timestampFilter: FilterState,
) => greptimeScoreReads.getScoreStringValues(projectId, timestampFilter);

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

export const hasAnyScoreOlderThan = (projectId: string, beforeDate: Date) =>
  greptimeScoreReads.hasAnyScoreOlderThan(projectId, beforeDate);

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

export const getNumericScoreHistogram = (
  projectId: string,
  filter: FilterState,
  limit: number,
) => greptimeScoreReads.getNumericScoreHistogram(projectId, filter, limit);

export const getAggregatedScoresForPrompts = (
  projectId: string,
  promptIds: string[],
  fetchScoreRelation: "observation" | "trace",
  timestampWindow: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) =>
  greptimeScoreReads.getAggregatedScoresForPrompts(
    projectId,
    promptIds,
    fetchScoreRelation,
    timestampWindow,
  );

export const getScoreCountsByProjectInCreationInterval = (args: {
  start: Date;
  end: Date;
}) => greptimeScoreReads.getScoreCountsByProjectInCreationInterval(args);

export const getScoreCountOfProjectsSinceCreationDate = (args: {
  projectIds: string[];
  start: Date;
}) => greptimeScoreReads.getScoreCountOfProjectsSinceCreationDate(args);

export const getDistinctScoreNames = (p: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterState;
  isTimestampFilter: (filter: FilterCondition) => filter is TimeFilter;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) =>
  greptimeScoreReads.getDistinctScoreNames({
    projectId: p.projectId,
    cutoffCreatedAt: p.cutoffCreatedAt,
    filter: p.filter,
    isTimestampFilter: p.isTimestampFilter,
  });

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
      session_id,
      dataset_run_id,
      name,
      value,
      source,
      comment,
      data_type,
      string_value,
      created_at,
      updated_at
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
      dataTypes: LISTABLE_SCORE_TYPES,
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
  options: { useGraceHash?: boolean } = {},
) {
  // Pre-filter traces in a CTE so the trace timestamp window prunes partitions
  // directly, instead of living in an OR clause after the LEFT JOIN where the
  // planner cannot push it down. Subtract 7d from minTimestamp to keep scores
  // whose trace was created before the score window started.
  const query = `
    WITH selected_traces AS (
      SELECT
        t.project_id as project_id,
        t.id as id,
        t.name as name,
        t.session_id as session_id,
        t.user_id as user_id,
        t.release as release,
        t.tags as tags,
        t.metadata['$posthog_session_id'] as posthog_session_id,
        t.metadata['$mixpanel_session_id'] as mixpanel_session_id
      FROM traces t FINAL
      WHERE t.project_id = {projectId: String}
      AND t.timestamp >= {minTimestamp: DateTime64(3)} - INTERVAL 7 DAY
      AND t.timestamp <= {maxTimestamp: DateTime64(3)}
    )

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
      t.release as trace_release,
      t.tags as trace_tags,
      s.metadata as metadata,
      t.posthog_session_id as posthog_session_id,
      t.mixpanel_session_id as mixpanel_session_id
    FROM scores s FINAL
    LEFT JOIN selected_traces t ON s.trace_id = t.id AND s.project_id = t.project_id
    WHERE s.project_id = {projectId: String}
    AND s.timestamp >= {minTimestamp: DateTime64(3)}
    AND s.timestamp < {maxTimestamp: DateTime64(3)}
    AND s.data_type IN ({dataTypes: Array(String)})
    AND (
      s.trace_id IS NOT NULL
      OR s.session_id IS NOT NULL
      OR s.dataset_run_id IS NOT NULL
    )
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
      dataTypes: LISTABLE_SCORE_TYPES,
    },
    tags: {
      feature: "posthog",
      type: "score",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
      ...(options.useGraceHash
        ? {
            clickhouse_settings: {
              join_algorithm: "grace_hash",
              grace_hash_join_initial_buckets: "32",
            },
          }
        : {}),
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

export const hasAnyScore = (projectId: string) =>
  greptimeScoreReads.hasAnyScore(projectId);

export const getScoreMetadataById = (
  projectId: string,
  id: string,
  source?: ScoreSourceType,
) => greptimeScoreReads.getScoreMetadataById(projectId, id, source);

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
export const getScoreCountsByProjectAndDay = (args: {
  startDate: Date;
  endDate: Date;
}) => greptimeScoreReads.getScoreCountsByProjectAndDay(args);

// ─── Cursor helpers (v3 pagination) ───────────────────────────────────────────

export const ScoresCursorV3 = z.discriminatedUnion("v", [
  z.object({
    v: z.literal(1),
    lastTimestamp: z.coerce.date(),
    lastId: z.string(),
  }),
]);
export type ScoresCursorV3Type = z.infer<typeof ScoresCursorV3>;

export const EncodedScoresCursorV3 = z
  .string()
  .transform((val) => {
    try {
      const decoded = Buffer.from(val, "base64url").toString("utf-8");
      return JSON.parse(decoded);
    } catch (_e) {
      throw new InvalidRequestError("Invalid cursor format");
    }
  })
  .pipe(ScoresCursorV3);

export const encodeCursorV3 = (cursor: ScoresCursorV3Type): string =>
  Buffer.from(
    JSON.stringify({
      v: cursor.v,
      lastTimestamp: cursor.lastTimestamp.toISOString(),
      lastId: cursor.lastId,
    }),
  ).toString("base64url");

// ─── v1/v2 public-API score query helpers ─────────────────────────────────────

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
  sessionId?: string;
  datasetRunId?: string;
  queueId?: string;
  traceTags?: string | string[];
  operator?: string;
  scoreIds?: string[];
  observationId?: string[];
  dataType?: string;
  environment?: string | string[];
  fields?: string[] | null;
  advancedFilters?: FilterState;
};

export const _handleGenerateScoresForPublicApi = async ({
  projectId,
  scoresFilter,
  tracesFilter,
  scoreScope,
  includeTrace,
  needsTraceJoin,
  pagination,
}: {
  projectId: string;
  scoresFilter: FilterList;
  tracesFilter: FilterList;
  scoreScope: "traces_only" | "all";
  includeTrace: boolean;
  needsTraceJoin: boolean;
  pagination?: { limit: number; page: number };
}) => {
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  const query = `
      SELECT
          ${needsTraceJoin ? "t.user_id as user_id, t.tags as tags, t.environment as trace_environment, t.session_id as trace_session_id," : ""}
          s.id as id,
          s.project_id as project_id,
          s.timestamp as timestamp,
          s.environment as environment,
          s.name as name,
          s.value as value,
          s.string_value as string_value,
          s.long_string_value as long_string_value,
          s.author_user_id as author_user_id,
          s.created_at as created_at,
          s.updated_at as updated_at,
          s.source as source,
          s.comment as comment,
          s.metadata as metadata,
          s.data_type as data_type,
          s.config_id as config_id,
          s.queue_id as queue_id,
          s.execution_trace_id as execution_trace_id,
          s.trace_id as trace_id,
          s.observation_id as observation_id,
          s.session_id as session_id,
          s.dataset_run_id as dataset_run_id
      FROM
          scores s
          ${needsTraceJoin ? "LEFT JOIN __TRACE_TABLE__ t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
      WHERE
          s.project_id = {projectId: String}
          AND (
            ${scoreScope === "traces_only" ? "" : "s.trace_id IS NULL OR "}
            (s.trace_id IS NOT NULL AND (${needsTraceJoin ? "t.id, t.project_id" : "s.trace_id, s.project_id"}) IN (
              SELECT
                ${needsTraceJoin ? "trace_id, project_id" : "s.trace_id, s.project_id"}
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
          s.timestamp desc, s.event_ts desc
      LIMIT
          1 BY s.id, s.project_id
      ${pagination !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

  return measureAndReturn({
    operationName: "_handleGenerateScoresForPublicApi",
    projectId,
    input: {
      params: {
        ...appliedScoresFilter.params,
        ...appliedTracesFilter.params,
        projectId,
        ...(pagination !== undefined
          ? {
              limit: pagination.limit,
              offset: (pagination.page - 1) * pagination.limit,
            }
          : {}),
      },
      tags: {
        feature: "scoring",
        type: "score",
        projectId,
        scoreScope,
        operation_name: "_handleGenerateScoresForPublicApi",
        includeTrace: includeTrace.toString(),
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<
        ScoreRecordReadType & {
          tags?: string[];
          user_id?: string;
          trace_environment?: string;
          trace_session_id?: string | null;
        }
      >({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });

      return records.map((record) => {
        const domainScore = convertClickhouseScoreToDomain(record);
        return {
          ...domainScore,
          trace:
            includeTrace && record.trace_id !== null
              ? {
                  userId: record.user_id,
                  tags: record.tags,
                  environment: record.trace_environment,
                  sessionId: record.trace_session_id,
                }
              : null,
        };
      });
    },
  });
};

export const _handleGetScoresCountForPublicApi = async ({
  projectId,
  scoresFilter,
  tracesFilter,
  scoreScope,
  includeTrace,
  needsTraceJoin,
}: {
  projectId: string;
  scoresFilter: FilterList;
  tracesFilter: FilterList;
  scoreScope: "traces_only" | "all";
  includeTrace: boolean;
  needsTraceJoin: boolean;
}) => {
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  const query = `
      SELECT
        count() as count
      FROM
        scores s
          ${needsTraceJoin ? "LEFT JOIN __TRACE_TABLE__ t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
      WHERE
        s.project_id = {projectId: String}
      AND (
        ${scoreScope === "traces_only" ? "" : "s.trace_id IS NULL OR "}
        (s.trace_id IS NOT NULL AND (${needsTraceJoin ? "t.id, t.project_id" : "s.trace_id, s.project_id"}) IN (
          SELECT
            ${needsTraceJoin ? "trace_id, project_id" : "s.trace_id, s.project_id"}
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

  return measureAndReturn({
    operationName: "_handleGetScoresCountForPublicApi",
    projectId,
    input: {
      params: {
        ...appliedScoresFilter.params,
        ...appliedTracesFilter.params,
        projectId,
      },
      tags: {
        feature: "scoring",
        type: "score",
        projectId,
        scoreScope,
        operation_name: "_handleGetScoresCountForPublicApi",
        includeTrace: includeTrace.toString(),
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

// ─── v3 public-API score query helpers ────────────────────────────────────────

type ListFilterParams = {
  id?: string[];
  name?: string[];
  source?: string[];
  dataType?: string[];
  environment?: string[];
  configId?: string[];
  queueId?: string[];
  authorUserId?: string[];
  value?: string[];
  valueMin?: number;
  valueMax?: number;
  traceId?: string[];
  sessionId?: string[];
  observationId?: string[];
  experimentId?: string[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
};

const CORE_COLUMNS_V3 = [
  "s.id as id",
  "s.project_id as project_id",
  "s.timestamp as timestamp",
  "s.environment as environment",
  "s.name as name",
  "s.value as value",
  "s.string_value as string_value",
  "s.long_string_value as long_string_value",
  "s.source as source",
  "s.data_type as data_type",
  "s.created_at as created_at",
  "s.updated_at as updated_at",
  "s.execution_trace_id as execution_trace_id",
];
const DETAILS_COLUMNS_V3 = [
  "s.comment as comment",
  "s.metadata as metadata",
  "s.config_id as config_id",
];
const SUBJECT_COLUMNS_V3 = [
  "s.trace_id as trace_id",
  "s.observation_id as observation_id",
  "s.session_id as session_id",
  "s.dataset_run_id as dataset_run_id",
];
const ANNOTATION_COLUMNS_V3 = [
  "s.author_user_id as author_user_id",
  "s.queue_id as queue_id",
];

export const buildSelectColumns = (fields: ScoreFieldGroupV3[]): string => {
  const selected = [...CORE_COLUMNS_V3];
  if (fields.includes("details")) selected.push(...DETAILS_COLUMNS_V3);
  if (fields.includes("subject")) selected.push(...SUBJECT_COLUMNS_V3);
  if (fields.includes("annotation")) selected.push(...ANNOTATION_COLUMNS_V3);
  return selected.join(",\n    ");
};

export function transformBooleanValueForFilter(v: "true" | "false"): number {
  if (v === "true") return 1;
  if (v === "false") return 0;
  throw new InternalServerError(
    `transformBooleanValueForFilter received unexpected value: ${v}`,
  );
}

function buildDynamicFilters(params: ListFilterParams): {
  query: string;
  params: Record<string, unknown>;
} {
  const filterList = new FilterList();

  type StringOptionFilterKey = Extract<
    keyof ListFilterParams,
    | "id"
    | "name"
    | "source"
    | "dataType"
    | "environment"
    | "configId"
    | "queueId"
    | "authorUserId"
    | "traceId"
    | "sessionId"
    | "observationId"
    | "experimentId"
  >;

  const STRING_OPTIONS_FILTERS: ReadonlyArray<{
    key: StringOptionFilterKey;
    field: string;
  }> = [
    { key: "id", field: "id" },
    { key: "name", field: "name" },
    { key: "source", field: "source" },
    { key: "dataType", field: "data_type" },
    { key: "environment", field: "environment" },
    { key: "configId", field: "config_id" },
    { key: "queueId", field: "queue_id" },
    { key: "authorUserId", field: "author_user_id" },
    { key: "traceId", field: "trace_id" },
    { key: "sessionId", field: "session_id" },
    { key: "observationId", field: "observation_id" },
    { key: "experimentId", field: "dataset_run_id" },
  ];

  for (const { key, field } of STRING_OPTIONS_FILTERS) {
    const values = params[key];
    if (values?.length) {
      filterList.push(
        new StringOptionsFilter({
          clickhouseTable: "scores",
          field,
          operator: "any of",
          values,
          tablePrefix: "s",
        }),
      );
    }
  }
  if (params.fromTimestamp !== undefined)
    filterList.push(
      new DateTimeFilter({
        clickhouseTable: "scores",
        field: "timestamp",
        operator: ">=",
        value: params.fromTimestamp,
        tablePrefix: "s",
      }),
    );
  if (params.toTimestamp !== undefined)
    filterList.push(
      new DateTimeFilter({
        clickhouseTable: "scores",
        field: "timestamp",
        operator: "<",
        value: params.toTimestamp,
        tablePrefix: "s",
      }),
    );
  if (params.valueMin !== undefined)
    filterList.push(
      new NumberFilter({
        clickhouseTable: "scores",
        field: "value",
        operator: ">=",
        value: params.valueMin,
        tablePrefix: "s",
        clickhouseTypeOverwrite: "Float64",
      }),
    );
  if (params.valueMax !== undefined)
    filterList.push(
      new NumberFilter({
        clickhouseTable: "scores",
        field: "value",
        operator: "<=",
        value: params.valueMax,
        tablePrefix: "s",
        clickhouseTypeOverwrite: "Float64",
      }),
    );

  const compiled = filterList.apply();

  const extraClauses: string[] = [];
  const extraParams: Record<string, unknown> = {};

  if (params.value?.length && params.dataType?.length === 1) {
    const dt = params.dataType[0] as ScoreDataTypeType;
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `valueFilter${uid}`;

    switch (dt) {
      case ScoreDataTypeEnum.NUMERIC: {
        extraClauses.push(`s.value IN ({${varName}: Array(Float64)})`);
        extraParams[varName] = params.value.map((v) => {
          const n = Number(v);
          if (!Number.isFinite(n)) {
            throw new InternalServerError(
              `NUMERIC value filter received non-finite value: ${v}`,
            );
          }
          return n;
        });
        break;
      }
      case ScoreDataTypeEnum.BOOLEAN: {
        extraClauses.push(`s.value IN ({${varName}: Array(Float64)})`);
        extraParams[varName] = params.value.map((v) =>
          transformBooleanValueForFilter(v as "true" | "false"),
        );
        break;
      }
      case ScoreDataTypeEnum.CATEGORICAL: {
        extraClauses.push(`s.string_value IN ({${varName}: Array(String)})`);
        extraParams[varName] = params.value;
        break;
      }
      case ScoreDataTypeEnum.TEXT:
      case ScoreDataTypeEnum.CORRECTION:
        throw new InternalServerError(
          `value filter with dataType=${dt} should have been rejected by handler validation`,
        );
      default: {
        const _exhaustiveCheck: never = dt;
        throw new InternalServerError(
          `value filter received unknown dataType: ${_exhaustiveCheck as string}`,
        );
      }
    }
  }

  const allClauses = [compiled.query, ...extraClauses]
    .filter(Boolean)
    .join(" AND ");

  return { query: allClauses, params: { ...compiled.params, ...extraParams } };
}

const buildV3ListQuery = (
  withCursor: boolean,
  fields: ScoreFieldGroupV3[],
  filterClause: string,
) => `
  SELECT
    ${buildSelectColumns(fields)}
  FROM scores s
  WHERE s.project_id = {projectId: String}
  ${
    withCursor
      ? "AND (s.timestamp, s.id) < ({lastTimestamp: DateTime64(3)}, {lastId: String})"
      : ""
  }
  ${filterClause ? `AND ${filterClause}` : ""}
  ORDER BY s.timestamp DESC, s.id DESC, s.event_ts DESC
  LIMIT 1 BY s.id, s.project_id
  LIMIT {limit: Int32}
`;

export function polymorphicValueForV3(score: {
  dataType: ScoreDataTypeType;
  value: number;
  stringValue?: string | null;
  longStringValue?: string | null;
}): number | boolean | string {
  switch (score.dataType) {
    case ScoreDataTypeEnum.NUMERIC:
      return score.value;
    case ScoreDataTypeEnum.BOOLEAN:
      return score.value === 1;
    case ScoreDataTypeEnum.CATEGORICAL:
    case ScoreDataTypeEnum.TEXT:
      if (score.stringValue == null) {
        throw new InternalServerError(
          `Score with dataType ${score.dataType} is missing its stringValue`,
        );
      }
      return score.stringValue;
    case ScoreDataTypeEnum.CORRECTION:
      if (score.longStringValue == null) {
        throw new InternalServerError(
          "Score with dataType CORRECTION is missing its longStringValue",
        );
      }
      return score.longStringValue;
    default: {
      const _exhaustiveCheck: never = score.dataType;
      throw new InternalServerError(
        `Score has unknown dataType: ${_exhaustiveCheck as string}`,
      );
    }
  }
}

function deriveSubjectForV3(
  score: ScoreDomain,
):
  | { kind: "observation"; id: string; traceId?: string }
  | { kind: "trace" | "session" | "experiment"; id: string } {
  if (score.datasetRunId) {
    return { kind: "experiment", id: score.datasetRunId };
  }
  if (score.observationId) {
    return {
      kind: "observation",
      id: score.observationId,
      ...(score.traceId ? { traceId: score.traceId } : {}),
    };
  }
  if (score.sessionId) {
    return { kind: "session", id: score.sessionId };
  }
  if (!score.traceId) {
    throw new InternalServerError(
      `Score ${score.id} has kind=trace but missing traceId`,
    );
  }
  return { kind: "trace", id: score.traceId };
}

function domainToV3Shared(
  score: ScoreDomain,
  fields: ScoreFieldGroupV3[],
): APIScoreV3 {
  return {
    id: score.id,
    projectId: score.projectId,
    name: score.name,
    dataType: score.dataType,
    value: polymorphicValueForV3({
      dataType: score.dataType,
      value: score.value,
      stringValue: score.stringValue as string | null | undefined,
      longStringValue: score.longStringValue as string | null | undefined,
    }),
    source: score.source,
    timestamp: score.timestamp,
    environment: score.environment,
    createdAt: score.createdAt,
    updatedAt: score.updatedAt,
    ...(fields.includes("details")
      ? {
          comment: score.comment,
          configId: score.configId,
          metadata: score.metadata,
        }
      : {}),
    ...(fields.includes("annotation")
      ? {
          authorUserId: score.authorUserId,
          queueId: score.queueId,
        }
      : {}),
    ...(fields.includes("subject")
      ? { subject: deriveSubjectForV3(score) }
      : {}),
  } as APIScoreV3;
}

export async function listScoresV3ForPublicApi(
  params: {
    projectId: string;
    limit: number;
    cursor?: ScoresCursorV3Type;
    fields: ScoreFieldGroupV3[];
  } & ListFilterParams,
): Promise<{ data: APIScoreV3[]; cursor?: string }> {
  const { query: filterClause, params: filterParams } =
    buildDynamicFilters(params);

  return measureAndReturn({
    operationName: "listScoresV3ForPublicApi",
    projectId: params.projectId,
    input: {
      params: {
        projectId: params.projectId,
        limit: params.limit + 1,
        ...(params.cursor && {
          lastTimestamp: convertDateToClickhouseDateTime(
            params.cursor.lastTimestamp,
          ),
          lastId: params.cursor.lastId,
        }),
        ...filterParams,
      },
      tags: {
        feature: "scoring",
        type: "score",
        projectId: params.projectId,
        operation_name: "listScoresV3ForPublicApi",
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<ScoreRecordReadType>({
        query: buildV3ListQuery(
          Boolean(params.cursor),
          params.fields,
          filterClause,
        ),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });

      const hasMore = records.length > params.limit;
      const pageRecords = hasMore ? records.slice(0, params.limit) : records;

      let nextCursor: string | undefined;
      if (hasMore && pageRecords.length > 0) {
        const last = pageRecords[pageRecords.length - 1];
        nextCursor = encodeCursorV3({
          v: 1,
          lastTimestamp: parseClickhouseUTCDateTimeFormat(
            String(last.timestamp),
          ),
          lastId: last.id,
        });
      }

      const items: APIScoreV3[] = [];
      for (const row of pageRecords) {
        try {
          items.push(
            domainToV3Shared(
              convertClickhouseScoreToDomain(row),
              params.fields,
            ),
          );
        } catch (error) {
          logger.error("v3 score row dropped from response: conversion error", {
            error,
            scoreId: row.id,
            projectId: params.projectId,
          });
        }
      }
      return {
        data: filterAndValidateV3GetScoreList(items, (error) => {
          logger.error(
            "v3 score row dropped from response: schema validation error",
            {
              issues: error.issues,
              projectId: params.projectId,
            },
          );
        }),
        cursor: nextCursor,
      };
    },
  });
}
