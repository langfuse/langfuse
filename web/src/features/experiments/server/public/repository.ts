import {
  convertDateToClickhouseDateTime,
  deriveFilters,
  EventsQueryBuilder,
  buildEventsFullTableSplitQuery,
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
  type QueryWithParams,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import { type EventsTableFilterState } from "@langfuse/shared";

type ExperimentSummaryClickhouseRow = {
  experiment_id: string;
  experiment_name: string;
  experiment_description: string | null;
  experiment_dataset_id: string | null;
  end_time: string;
  cursor_trace_hash: number;
  cursor_trace_id: string;
  cursor_span_id: string;
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
  lastTime: string;
  lastId: string;
  lastExperimentId: string;
};

type ExperimentItemCursor = ExperimentCursor & {
  lastTraceId: string;
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
  cursor?: ExperimentItemCursor;
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

const EXPERIMENT_SUMMARY_CURSOR_LOOKBACK_INTERVAL = "INTERVAL 1 DAY";
const EXPERIMENT_SCORE_TIMESTAMP_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day

const scoreTimestampBoundsFromRows = <TRow>(
  rows: TRow[],
  getTimestamp: (row: TRow) => string,
) => {
  const newestRow = rows[0];
  const oldestRow = rows.at(-1);

  if (!newestRow || !oldestRow) {
    throw new Error("Cannot derive score timestamp bounds from an empty page");
  }

  const newestRowTimestamp = parseClickhouseUTCDateTimeFormat(
    getTimestamp(newestRow),
  );
  const oldestRowTimestamp = parseClickhouseUTCDateTimeFormat(
    getTimestamp(oldestRow),
  );

  return {
    fromTimestamp: new Date(
      oldestRowTimestamp.getTime() - EXPERIMENT_SCORE_TIMESTAMP_WINDOW_MS,
    ),
    toTimestamp: new Date(
      Math.min(
        Date.now(),
        newestRowTimestamp.getTime() + EXPERIMENT_SCORE_TIMESTAMP_WINDOW_MS,
      ),
    ),
  };
};

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
      id: params.id,
      name: params.name,
      datasetId: params.datasetId,
    },
    publicApiExperimentSimpleFilterMappings,
    params.advancedFilters,
    publicApiExperimentColumnMappings,
    publicApiExperimentColumnDefinitions,
  );

  const queryBuilder = new EventsQueryBuilder({ projectId: params.projectId })
    .selectFieldSet(
      "publicApiExperimentSummaryCore",
      ...(params.includeMetadata
        ? (["publicApiExperimentSummaryMetadata"] as const)
        : []),
    )
    .whereRaw("e.experiment_id != ''")
    .withExactTimeFrom(fromStartTime)
    .withExactTimeTo(toStartTime)
    .applyFilters(filterList)
    .withExperimentSummaryCursor(
      params.cursor
        ? {
            lastTime: params.cursor.lastTime,
            lastId: params.cursor.lastId,
            lastExperimentId: params.cursor.lastExperimentId,
            lookbackInterval: EXPERIMENT_SUMMARY_CURSOR_LOOKBACK_INTERVAL,
          }
        : undefined,
    )
    .orderByColumns([
      { column: "e.start_time", direction: "DESC" },
      { column: "e.experiment_id", direction: "DESC" },
      { column: "e.span_id", direction: "DESC" },
    ])
    .limitBy("e.project_id", "e.experiment_id")
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

  const scoreTimestampBounds = scoreTimestampBoundsFromRows(
    rows,
    (row) => row.end_time,
  );
  const scoresByExperimentId = groupExperimentScores(
    await queryScoreRecordsForExperiments({
      projectId: params.projectId,
      experimentIds: rows.map((row) => row.experiment_id),
      // scores need to be newer than the oldest row - 1 day
      fromTimestamp: scoreTimestampBounds.fromTimestamp,
      // scores can't be newer than min(now(), newest row + 1 day)
      toTimestamp: scoreTimestampBounds.toTimestamp,
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

const experimentItemOrderByColumns = (alias: "e" | "b") => {
  const idColumn = alias === "e" ? "span_id" : "id";

  return [
    { column: `${alias}.start_time`, direction: "DESC" },
    { column: `xxHash32(${alias}.trace_id)`, direction: "DESC" },
    { column: `${alias}.${idColumn}`, direction: "DESC" },
    { column: `${alias}.experiment_id`, direction: "DESC" },
  ] as const;
};

const filterForItems = (builder: EventsQueryBuilder) =>
  builder.whereRaw("e.experiment_id != ''");

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
    ),
  )
    .when(params.includeIo, (b) =>
      b.selectFieldSet("publicApiExperimentItemExpectedOutput"),
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
            lastTime: params.cursor.lastTime,
            lastTraceId: params.cursor.lastTraceId,
            lastId: params.cursor.lastId,
            lastExperimentId: params.cursor.lastExperimentId,
          }
        : undefined,
    )
    .orderByColumns([...experimentItemOrderByColumns("e")])
    .limitBy("e.span_id", "e.project_id")
    .limit(params.limit);

  const builder: QueryWithParams =
    params.includeIo || params.includeMetadata
      ? buildEventsFullTableSplitQuery({
          projectId: params.projectId,
          baseBuilder: queryBuilder,
          includeIO: params.includeIo,
          includeMetadata: params.includeMetadata,
        }).orderByColumns([...experimentItemOrderByColumns("b")], {
          eventTableAlias: "b",
        })
      : queryBuilder;

  const { query, params: queryParams } = builder.buildWithParams();

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

  const scoreTimestampBounds = scoreTimestampBoundsFromRows(
    rows,
    (row) => row.start_time,
  );
  const scoresBySpanId = Object.groupBy(
    await queryScoreRecordsForExperimentItems({
      projectId: params.projectId,
      traceIds: rows.map((row) => row.trace_id),
      observationIds: rows.map((row) => row.id),
      // scores need to be newer than the oldest item
      min: scoreTimestampBounds.fromTimestamp,
      // scores can't be newer than min(now, newest item + 1 day)
      toTimestamp: scoreTimestampBounds.toTimestamp,
      scoreLimit: params.scoreLimit ?? DEFAULT_SCORE_LIMIT,
    }),
    (score) => score.observation_id ?? "",
  );

  return rows.map(
    (row): ExperimentItemRow => ({
      ...row,
      scores: scoresBySpanId[row.id] ?? [],
    }),
  );
}
