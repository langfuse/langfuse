import {
  convertDateToClickhouseDateTime,
  deriveFilters,
  ExperimentsAggregationQueryBuilder,
  measureAndReturn,
  publicApiExperimentColumnDefinitions,
  publicApiExperimentColumnMappings,
  publicApiExperimentSimpleFilterMappings,
  queryClickhouse,
  scoreRecordReadSchema,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import type { EventsTableFilterState } from "@langfuse/shared";

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
  scores?: unknown[][] | null;
};

type ExperimentSummaryRow = Omit<ExperimentSummaryClickhouseRow, "scores"> & {
  scores?: ScoreRecordReadType[] | null;
};

const DEFAULT_SCORE_LIMIT = 50;

const SCORE_TUPLE_COLUMNS = scoreRecordReadSchema.keyof().options;

const buildScoresByExperimentJoinTable = (scoreLimit: number) => {
  const scoreColumns = SCORE_TUPLE_COLUMNS.map((column) => `s.${column}`).join(
    ", ",
  );

  return `(
    SELECT
      s.dataset_run_id,
      groupArray(${scoreLimit})(tuple(${scoreColumns})) AS scores
    FROM (
      SELECT
        ${scoreColumns}
      FROM scores s
      WHERE s.project_id = {projectId: String}
        AND s.timestamp >= {startTimeFrom: DateTime64(3)}
        AND s.dataset_run_id IS NOT NULL
        AND s.trace_id IS NULL
        AND s.observation_id IS NULL
        AND s.session_id IS NULL
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
    ) s
    GROUP BY s.dataset_run_id
  ) s`;
};

const scoreTupleToRecord = (score: unknown[]): ScoreRecordReadType =>
  Object.fromEntries(
    SCORE_TUPLE_COLUMNS.map((column, index) => [column, score[index]]),
  ) as ScoreRecordReadType;

const mapExperimentSummaryRow = (
  row: ExperimentSummaryClickhouseRow,
): ExperimentSummaryRow => ({
  ...row,
  scores: row.scores ? row.scores.map(scoreTupleToRecord) : row.scores,
});

type ExperimentSummariesCursor = {
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
  cursor?: ExperimentSummariesCursor;
  includeMetadata: boolean;
  includeScores: boolean;
  scoreLimit?: number;
};

export async function queryExperimentSummariesForPublicApi(
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

  const eventQueryBuilder = new ExperimentsAggregationQueryBuilder({
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

  if (params.includeScores) {
    eventQueryBuilder
      .selectRaw("any(s.scores) AS scores")
      .leftAnyJoin(
        buildScoresByExperimentJoinTable(
          params.scoreLimit ?? DEFAULT_SCORE_LIMIT,
        ),
        "ON s.dataset_run_id = e.experiment_id",
      );
  }

  const { query, params: queryParams } = eventQueryBuilder.buildWithParams();

  return await measureAndReturn({
    operationName: "queryExperimentSummariesForPublicApi",
    projectId: params.projectId,
    spanAttributes: {
      "langfuse.query.include_metadata": params.includeMetadata,
      "langfuse.query.include_scores": params.includeScores,
    },
    input: {
      params: queryParams,
      tags: {
        feature: "experiments",
        type: "events",
        kind: "publicApi",
        projectId: params.projectId,
        operation_name: "queryExperimentSummariesForPublicApi",
      },
    },
    fn: async (input) =>
      (
        await queryClickhouse<ExperimentSummaryClickhouseRow>({
          query,
          params: input.params,
          tags: input.tags,
          preferredClickhouseService: "EventsReadOnly",
        })
      ).map(mapExperimentSummaryRow),
  });
}
