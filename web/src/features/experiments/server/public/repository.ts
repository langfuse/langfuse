import {
  convertDateToClickhouseDateTime,
  deriveFilters,
  EventsQueryBuilder,
  ExperimentsAggregationQueryBuilder,
  measureAndReturn,
  parseClickhouseUTCDateTimeFormat,
  publicApiExperimentItemColumnDefinitions,
  publicApiExperimentItemColumnMappings,
  publicApiExperimentItemSimpleFilterMappings,
  publicApiExperimentColumnDefinitions,
  publicApiExperimentColumnMappings,
  publicApiExperimentSimpleFilterMappings,
  queryClickhouse,
  queryScoreRecordsForExperimentItems,
  queryScoreRecordsForExperiments,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import { type EventsTableFilterState } from "@langfuse/shared";

type ExperimentSummaryClickhouseRow = {
  experiment_id: string;
  experiment_name: string;
  experiment_description: string | null;
  experiment_dataset_id: string;
  start_time: string;
  cursor_trace_hash: number;
  cursor_trace_id: string;
  cursor_span_id: string;
  item_count: string;
  experiment_metadata?: Record<string, unknown> | null;
};

type ExperimentSummaryRow = ExperimentSummaryClickhouseRow & {
  scores?: ScoreRecordReadType[];
};

type ExperimentItemClickhouseRow = {
  id: string;
  trace_id: string;
  start_time: string;
  end_time: string | null;
  level: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
  environment: string;
  experiment_id: string;
  experiment_name: string | null;
  experiment_item_id: string;
  experiment_dataset_id?: string | null;
  experiment_item_version?: string | null;
  input?: unknown;
  output?: unknown;
  experiment_item_expected_output?: unknown;
  metadata?: Record<string, unknown> | null;
  experiment_item_metadata?: Record<string, unknown> | null;
  experiment_metadata?: Record<string, unknown> | null;
  experiment_description?: string | null;
};

type ExperimentItemRow = ExperimentItemClickhouseRow & {
  scores?: ScoreRecordReadType[];
};

const DEFAULT_SCORE_LIMIT = 50;

type ExperimentCursor = {
  lastStartTime: Date;
  lastTraceId: string;
  lastId: string;
  lastExperimentId: string;
};

type QueryExperimentSummariesParams = {
  projectId: string;
  fromStartTime: Date;
  toStartTime?: Date;
  limit: number;
  id?: string[];
  name?: string[];
  datasetId?: string[];
  advancedFilters?: EventsTableFilterState;
  cursor?: ExperimentCursor;
  includeMetadata: boolean;
  includeScores?: boolean;
  scoreLimit?: number;
};

type QueryExperimentItemsParams = {
  projectId: string;
  fromStartTime?: Date;
  toStartTime?: Date;
  limit: number;
  experimentId?: string[];
  experimentName?: string[];
  experimentItemId?: string[];
  datasetId?: string[];
  advancedFilters?: EventsTableFilterState;
  cursor?: ExperimentCursor;
  includeDataset: boolean;
  includeIo: boolean;
  includeMetadata: boolean;
  includeItemMetadata: boolean;
  includeExperimentMetadata: boolean;
  includeScores?: boolean;
  scoreLimit?: number;
};

const groupExperimentScores = (scores: ScoreRecordReadType[]) => {
  return Object.groupBy(
    scores.filter(
      (score): score is ScoreRecordReadType & { dataset_run_id: string } =>
        Boolean(score.dataset_run_id),
    ),
    (score) => score.dataset_run_id,
  );
};

const groupExperimentItemScores = (scores: ScoreRecordReadType[]) => {
  const byObservationId: Record<string, ScoreRecordReadType[]> = {};
  const byTraceId: Record<string, ScoreRecordReadType[]> = {};

  for (const score of scores) {
    if (score.observation_id) {
      (byObservationId[score.observation_id] ??= []).push(score);
      continue;
    }

    if (score.trace_id) {
      (byTraceId[score.trace_id] ??= []).push(score);
    }
  }

  return { byObservationId, byTraceId };
};

const startTimeBounds = (rows: { start_time: string }[]) => ({
  min: parseClickhouseUTCDateTimeFormat(rows[rows.length - 1]!.start_time),
  max: parseClickhouseUTCDateTimeFormat(rows[0]!.start_time),
});

async function queryExperimentSummaryRowsForPublicApi(
  params: QueryExperimentSummariesParams,
) {
  const fromStartTime = convertDateToClickhouseDateTime(params.fromStartTime);
  const toStartTime = params.toStartTime
    ? convertDateToClickhouseDateTime(params.toStartTime)
    : undefined;

  const filterList = deriveFilters(
    {
      projectId: params.projectId,
      // deriveFilters expects page/limit even though this query applies cursor
      // pagination on the query builder below.
      page: 0,
      limit: params.limit,
      name: params.name,
      datasetId: params.datasetId,
    },
    publicApiExperimentSimpleFilterMappings,
    params.advancedFilters,
    publicApiExperimentColumnMappings,
    publicApiExperimentColumnDefinitions,
  );

  const queryBuilder = new ExperimentsAggregationQueryBuilder({
    projectId: params.projectId,
  })
    .selectFieldSet(
      "publicApiCore",
      ...(params.includeMetadata ? (["publicApiMetadata"] as const) : []),
    )
    .withExperimentIds(params.id)
    .withExactStartTimeFrom(fromStartTime)
    .withExactStartTimeTo(toStartTime)
    .whereRaw("e.experiment_id != ''")
    .whereRaw(
      "e.experiment_dataset_id IS NOT NULL AND length(e.experiment_dataset_id) > 0",
    )
    .applyFilters(filterList)
    .withCursor(
      params.cursor
        ? {
            lastStartTime: convertDateToClickhouseDateTime(
              params.cursor.lastStartTime,
            ),
            lastTraceId: params.cursor.lastTraceId,
            lastId: params.cursor.lastId,
            lastExperimentId: params.cursor.lastExperimentId,
          }
        : undefined,
    )
    .orderBy(
      "ORDER BY start_time DESC, cursor_trace_hash DESC, cursor_span_id DESC, experiment_id DESC",
    )
    .limit(params.limit);

  const { query, params: queryParams } = queryBuilder.buildWithParams();

  const rows = await measureAndReturn({
    operationName: "queryExperimentSummaryRowsForPublicApi",
    projectId: params.projectId,
    input: {
      params: queryParams,
      tags: {
        feature: "experiments",
        type: "events",
        kind: "publicApi",
        projectId: params.projectId,
        operation_name: "queryExperimentSummaryRowsForPublicApi",
      },
    },
    fn: async (input) =>
      await queryClickhouse<ExperimentSummaryRow>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "EventsReadOnly",
      }),
  });

  return rows;
}

export async function queryExperimentSummariesForPublicApi(
  params: QueryExperimentSummariesParams,
) {
  const rows = await queryExperimentSummaryRowsForPublicApi(params);

  if (!params.includeScores || rows.length === 0) return rows;

  const scoresByExperimentId = groupExperimentScores(
    await queryScoreRecordsForExperiments({
      projectId: params.projectId,
      experimentIds: rows.map((row) => row.experiment_id),
      fromTimestamp: startTimeBounds(rows).min,
      scoreLimit: params.scoreLimit ?? DEFAULT_SCORE_LIMIT,
    }),
  );

  return rows.map(
    (row): ExperimentSummaryRow => ({
      ...row,
      scores: scoresByExperimentId[row.experiment_id] ?? [],
    }),
  );
}

const experimentItemOrderBy = (alias: "e" | "b") => {
  const idColumn = alias === "e" ? "span_id" : "id";

  return `ORDER BY ${alias}.start_time DESC, xxHash32(${alias}.trace_id) DESC, ${alias}.${idColumn} DESC, ${alias}.experiment_id DESC`;
};

const filterForItems = (builder: EventsQueryBuilder) =>
  builder
    .whereRaw("e.experiment_id != ''")
    .whereRaw("e.experiment_item_id != ''")
    .whereRaw("e.experiment_item_root_span_id = e.span_id");

async function queryExperimentItemRowsForPublicApi(
  params: QueryExperimentItemsParams,
) {
  const fromStartTime = params.fromStartTime
    ? convertDateToClickhouseDateTime(params.fromStartTime)
    : undefined;
  const toStartTime = params.toStartTime
    ? convertDateToClickhouseDateTime(params.toStartTime)
    : undefined;

  const filterList = deriveFilters(
    {
      projectId: params.projectId,
      page: 0,
      limit: params.limit,
      experimentId: params.experimentId,
      experimentName: params.experimentName,
      experimentItemId: params.experimentItemId,
      datasetId: params.datasetId,
    },
    publicApiExperimentItemSimpleFilterMappings,
    params.advancedFilters,
    publicApiExperimentItemColumnMappings,
    publicApiExperimentItemColumnDefinitions,
  );

  const queryBuilder = filterForItems(
    new EventsQueryBuilder({ projectId: params.projectId }).selectFieldSet(
      "publicApiExperimentItemCore",
      ...(params.includeDataset
        ? (["publicApiExperimentItemDataset"] as const)
        : []),
      ...(params.includeItemMetadata
        ? (["publicApiExperimentItemMetadataFields"] as const)
        : []),
      ...(params.includeExperimentMetadata
        ? (["publicApiExperimentItemExperimentMetadata"] as const)
        : []),
      ...(params.includeMetadata
        ? (["publicApiExperimentItemMetadata"] as const)
        : []),
    ),
  )
    .when(params.includeIo, (b) =>
      b.selectFieldSet("publicApiExperimentItemExpectedOutput").selectIO(false),
    )
    .when(Boolean(fromStartTime), (b) =>
      b.whereRaw("e.start_time >= {startTimeFrom: DateTime64(3)}", {
        startTimeFrom: fromStartTime,
      }),
    )
    .when(Boolean(toStartTime), (b) =>
      b.whereRaw("e.start_time < {startTimeTo: DateTime64(3)}", {
        startTimeTo: toStartTime,
      }),
    )
    .applyFilters(filterList)
    .withCursor(
      params.cursor
        ? {
            lastStartTime: convertDateToClickhouseDateTime(
              params.cursor.lastStartTime,
            ),
            lastTraceId: params.cursor.lastTraceId,
            lastId: params.cursor.lastId,
            lastExperimentId: params.cursor.lastExperimentId,
          }
        : undefined,
    )
    .orderBy(experimentItemOrderBy("e"))
    .limit(params.limit);

  const { query, params: queryParams } = queryBuilder.buildWithParams();

  const rows = await measureAndReturn({
    operationName: "queryExperimentItemRowsForPublicApi",
    projectId: params.projectId,
    input: {
      params: queryParams,
      tags: {
        feature: "experiments",
        type: "events",
        kind: "publicApi",
        projectId: params.projectId,
        operation_name: "queryExperimentItemRowsForPublicApi",
      },
    },
    fn: async (input) =>
      await queryClickhouse<ExperimentItemRow>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "EventsReadOnly",
      }),
  });

  return rows;
}

export async function queryExperimentItemsForPublicApi(
  params: QueryExperimentItemsParams,
) {
  const rows = await queryExperimentItemRowsForPublicApi(params);

  if (!params.includeScores || rows.length === 0) return rows;

  const groupedScores = groupExperimentItemScores(
    await queryScoreRecordsForExperimentItems({
      projectId: params.projectId,
      traceIds: rows.map((row) => row.trace_id),
      observationIds: rows.map((row) => row.id),
      ...startTimeBounds(rows),
      scoreLimit: params.scoreLimit ?? DEFAULT_SCORE_LIMIT,
    }),
  );

  return rows.map(
    (row): ExperimentItemRow => ({
      ...row,
      scores: [
        ...(groupedScores.byObservationId[row.id] ?? []),
        ...(groupedScores.byTraceId[row.trace_id] ?? []),
      ],
    }),
  );
}
