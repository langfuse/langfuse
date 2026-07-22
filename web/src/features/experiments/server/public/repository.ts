import {
  DateTimeFilter,
  deriveFilters,
  EventsQueryBuilder,
  FilterList,
  ExperimentsAggregationQueryBuilder,
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
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import { type EventsTableFilterState } from "@langfuse/shared";

type ExperimentSummaryRow = {
  experiment_id: string;
  experiment_name: string;
  experiment_description: string | null;
  experiment_dataset_id: string | null;
  start_time: string;
  end_time: string;
  cursor_time: string;
  cursor_trace_id: string;
  cursor_span_id: string;
  item_count: number;
  experiment_metadata?: Record<string, unknown> | null;
  scores?: ScoreRecordReadType[];
};

type ExperimentItemRow = {
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
  scores?: ScoreRecordReadType[];
};

const DEFAULT_SCORE_LIMIT = 50;

type ExperimentCursor = {
  lastTime: string;
  lastTraceId: string;
  lastId: string;
  lastExperimentId: string;
};

type QueryExperimentSummariesParams = {
  projectId: string;
  fromTime: Date;
  toTime?: Date;
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
  fromTime?: Date;
  toTime?: Date;
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

const EXPERIMENT_SUMMARY_CURSOR_LOOKBACK_DAYS = 1;
const EXPERIMENT_SCORE_TIMESTAMP_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Exact event-level start_time bounds for the requested time window.
 */
const eventTimeBoundFilters = (fromTime?: Date, toTime?: Date) =>
  new FilterList([
    ...(fromTime
      ? [
          new DateTimeFilter({
            clickhouseTable: "events_proto",
            field: "start_time",
            tablePrefix: "e",
            operator: ">=" as const,
            value: fromTime,
          }),
        ]
      : []),
    ...(toTime
      ? [
          new DateTimeFilter({
            clickhouseTable: "events_proto",
            field: "start_time",
            tablePrefix: "e",
            operator: "<" as const,
            value: toTime,
          }),
        ]
      : []),
  ]);

/**
 * Apply cursor pagination for experiment items.
 *
 * The cursor is applied to raw event rows before any optional aggregation.
 * This keeps pagination on the same event-level ordering key as the item
 * ORDER BY clause.
 */
const applyExperimentItemCursor = (
  builder: EventsQueryBuilder,
  cursor?: ExperimentCursor,
) =>
  builder.when(Boolean(cursor), (b) => {
    if (!cursor) return b;

    return b.whereRaw(
      "e.start_time <= {lastTime: DateTime64(6)} AND (e.start_time, xxHash32(e.trace_id), e.span_id, e.experiment_id) < ({lastTime: DateTime64(6)}, xxHash32({lastTraceId: String}), {lastId: String}, {lastExperimentId: String})",
      {
        lastTime: cursor.lastTime,
        lastTraceId: cursor.lastTraceId,
        lastId: cursor.lastId,
        lastExperimentId: cursor.lastExperimentId,
      },
    );
  });

/**
 * Apply cursor pagination for experiment summaries.
 *
 * This follows the summary ordering key:
 * start_time, experiment_id, span_id.
 */
const applyExperimentSummaryCursor = (
  builder: EventsQueryBuilder,
  cursor?: ExperimentCursor,
) =>
  builder.when(Boolean(cursor), (b) => {
    if (!cursor) return b;

    return b
      .whereRaw(
        // The plain start_time bound is redundant with the tuple comparison
        // but lets the primary index prune granules newer than the cursor;
        // the tuple alone is not usable against the toStartOfMinute(start_time)
        // primary key.
        "e.start_time <= {lastTime: DateTime64(6)} AND (e.start_time, e.experiment_id, e.span_id) < ({lastTime: DateTime64(6)}, {lastExperimentId: String}, {lastId: String})",
        {
          lastTime: cursor.lastTime,
          lastExperimentId: cursor.lastExperimentId,
          lastId: cursor.lastId,
        },
      )
      .whereRaw(
        `e.experiment_id NOT IN (
  SELECT e2.experiment_id
  FROM events_core e2
  WHERE e2.project_id = {projectId: String}
    AND e2.experiment_id != ''
    -- don't list experiments that were part of the previous page - that means
    -- no newer item exists
    AND e2.start_time >= {lastTime: DateTime64(6)}
    -- experiments shouldn't take more than that so we checked back long
    AND e2.start_time < addDays({lastTime: DateTime64(6)}, {summaryCursorLookbackDays: UInt32})
    AND (e2.start_time, e2.experiment_id, e2.span_id) >= ({lastTime: DateTime64(6)}, {lastExperimentId: String}, {lastId: String})
)`,
        { summaryCursorLookbackDays: EXPERIMENT_SUMMARY_CURSOR_LOOKBACK_DAYS },
      );
  });

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

  // Phase 1: pick the page of experiment ids via LIMIT 1 BY on raw events.
  // Reading follows the table sort key and can stop once the page is full, and
  // the id-set keeps the phase-2 GROUP BY bounded to at most `limit` groups.
  const pageQueryBuilder = applyExperimentSummaryCursor(
    new EventsQueryBuilder({
      projectId: params.projectId,
    })
      .selectRaw("e.experiment_id AS experiment_id")
      .whereRaw("e.experiment_id != ''")
      .applyFilters(eventTimeBoundFilters(params.fromTime, params.toTime))
      .applyFilters(filterList),
    params.cursor,
  )
    .orderByColumns([
      { column: "e.start_time", direction: "DESC" },
      { column: "e.experiment_id", direction: "DESC" },
      { column: "e.span_id", direction: "DESC" },
    ])
    .limitBy("e.project_id", "e.experiment_id")
    .limit(params.limit);

  // Phase 2: aggregate only the paged experiments. Page order and cursor stay
  // on the phase-1 latest-event key (the row LIMIT 1 BY selected); start_time
  // surfaces the experiment start (earliest in-window event) independently of
  // the sort key.
  const aggregationBuilder = new ExperimentsAggregationQueryBuilder({
    projectId: params.projectId,
  })
    .selectFieldSet("publicApiSummary")
    .when(params.includeMetadata, (b) =>
      b.selectFieldSet("publicApiSummaryMetadata"),
    )
    .selectRaw(
      // True end: the latest event *end*, not the latest event start — an
      // earlier event can outlive the latest-starting one. The greatest()
      // clamps client-reported end_time < start_time rows so that
      // endTime >= startTime always holds in the response.
      "max(greatest(e.start_time, coalesce(e.end_time, e.start_time))) AS end_time",
      // max, not min: the cursor must reproduce the LATEST event (the row
      // LIMIT 1 BY kept under DESC order). Anchoring on the earliest event
      // would skip experiments whose only activity lies between the last
      // page experiment's first and last event.
      "max(e.start_time) AS cursor_time",
      "argMax(e.trace_id, (e.start_time, e.span_id)) AS cursor_trace_id",
      "argMax(e.span_id, (e.start_time, e.span_id)) AS cursor_span_id",
      // Counts item root spans to match what /experiment-items paginates.
      "uniqIf(e.span_id, e.span_id = e.experiment_item_root_span_id) AS item_count",
    )
    .applyFilters(eventTimeBoundFilters(params.fromTime, params.toTime))
    .withCTE("page_experiments", pageQueryBuilder.buildWithParams())
    .whereRaw("e.experiment_id IN (SELECT experiment_id FROM page_experiments)")
    .orderBy(
      "ORDER BY cursor_time DESC, experiment_id DESC, cursor_span_id DESC",
    );

  const { query, params: queryParams } = aggregationBuilder.buildWithParams();

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
    (row) => row.cursor_time,
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

  return rows.map((row) => ({
    ...row,
    scores: scoresByExperimentId[row.experiment_id] ?? [],
  }));
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

async function queryExperimentItemRowsForPublicApi(
  params: QueryExperimentItemsParams,
) {
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

  const queryBuilder = applyExperimentItemCursor(
    new EventsQueryBuilder({ projectId: params.projectId })
      .selectFieldSet("publicApiExperimentItemCore")
      .when(params.includeDataset, (b) =>
        b.selectFieldSet("publicApiExperimentItemDataset"),
      )
      .when(params.includeItemMetadata, (b) =>
        b.selectFieldSet("publicApiExperimentItemMetadataFields"),
      )
      .when(params.includeExperimentMetadata, (b) =>
        b.selectFieldSet("publicApiExperimentItemExperimentMetadata"),
      )
      .when(params.includeIo, (b) =>
        b.selectFieldSet("publicApiExperimentItemExpectedOutput"),
      )
      .whereRaw("e.experiment_id != ''")
      .whereRaw("e.experiment_item_id != ''")
      .whereRaw("e.experiment_item_root_span_id = e.span_id")
      .applyFilters(eventTimeBoundFilters(params.fromTime, params.toTime))
      .applyFilters(filterList),
    params.cursor,
  )
    .orderByColumns([...experimentItemOrderByColumns("e")])
    .limitBy("e.span_id", "e.project_id")
    .limit(params.limit);

  const builder =
    params.includeIo || params.includeMetadata
      ? buildEventsFullTableSplitQuery({
          projectId: params.projectId,
          baseBuilder: queryBuilder,
          includeIO: params.includeIo,
          includeMetadata: params.includeMetadata,
        }).orderByColumns([...experimentItemOrderByColumns("b")], {
          eventTableAlias: "b",
          matchTablePrimaryKey: true,
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
  const scoresByTraceId = Object.groupBy(
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
    (score) => score.trace_id ?? "",
  );

  return rows.map((row) => ({
    ...row,
    scores: scoresByTraceId[row.trace_id] ?? [],
  }));
}
