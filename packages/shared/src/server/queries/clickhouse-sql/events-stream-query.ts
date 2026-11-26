import type { Expression, ExpressionBuilder, QueryCreator } from "kysely";

import type { TracingSearchType } from "../../../interfaces/search";
import {
  conditionFromFilter,
  fromFilterState,
} from "../../../query-ast/filterStateCodec";
import type {
  PredicateAnd,
  PredicateCondition,
  PredicateSearch,
} from "../../../query-ast/predicate";
import type { FilterCondition } from "../../../types";
import { compileClickhouseQuery } from "../../query-ast/compile";
import { getClickhouseKysely } from "../../query-ast/dialect";
import {
  concat,
  groupArrayIf,
  groupUniqArray,
  groupUniqArrayIf,
  interval,
  type IntervalValue,
  limitBy,
  literal,
  lowerUTF8,
  minusInterval,
  notEmpty,
  toStartOfMinute,
  tuple,
  typedValue,
  useFinal,
} from "../../query-ast/extensions";
import type { ClickHouseDatabase } from "../../query-ast/schema";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL_DAYS,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_HOURS,
} from "../../repositories/constants";
import { eventsFieldSetKeys } from "../../repositories/events-field-sets";
import {
  lowerEventsPredicate,
  lowerEventsSearch,
} from "../../repositories/events-predicate";
import { lowerEventsScoreCondition } from "../../repositories/events-score-predicate";
import { eventsRowFieldSelects } from "../../repositories/events-selects";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import type { EventsQueryBuilder } from "./event-query-builder";
import {
  assertEventsRowSelectionLowerable,
  buildEventsObservationRowSelection,
  type EventsObservationFilterGroups,
  groupEventsObservationFilters,
  startTimeBoundsOf,
  startTimeFromOf,
  withoutPositionInTrace,
} from "./events-observation-row-selection";
import { resolveLegacyScoreFilterColumn } from "./factory";
import { shouldSkipScoresDedup } from "./query-options";

export type EventsStreamQueryInput = {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
};

export type EventsStreamQuery = {
  queryBuilder: EventsQueryBuilder;
};

/** The compiled blob-export read, and its lower `startTime` bound as text. */
type EventsBlobExportStreamQuery = {
  query: string;
  params: Record<string, unknown>;
  startTimeFrom: string | null;
};

/** `filter` without `positionInTrace` leaves, plus the cutoff as `startTime <`. */
const streamFilterConditions = (
  filter: FilterCondition[] | null,
  cutoffCreatedAt: Date | undefined,
): FilterCondition[] => {
  const filterConditions = withoutPositionInTrace(filter);
  if (cutoffCreatedAt) {
    filterConditions.push({
      column: "startTime",
      operator: "<",
      value: cutoffCreatedAt,
      type: "datetime",
    });
  }
  return filterConditions;
};

/**
 * Builds the common event selection used by streaming consumers.
 *
 * The returned builder is intentionally unprojected so each consumer can
 * select its own row shape. Callers must add a field set or raw selection
 * before building the query.
 *
 * Score filters are applied by the shared row-selection planner. Comment
 * filters must be resolved to event IDs before reaching this builder.
 */
export const buildEventsStreamQuery = ({
  projectId,
  cutoffCreatedAt,
  filter,
  searchQuery,
  searchType,
  rowLimit,
}: EventsStreamQueryInput): EventsStreamQuery => {
  const { queryBuilder } = buildEventsObservationRowSelection({
    projectId,
    filter: streamFilterConditions(filter, cutoffCreatedAt),
    searchQuery,
    searchType,
  });

  queryBuilder
    .whereRaw("e.is_deleted = 0")
    .orderByDefault()
    .limitBy("e.span_id", "e.project_id")
    .limit(rowLimit);

  return { queryBuilder };
};

/**
 * The batch export read of events: every observation matching `filter`, the
 * cutoff and the search, with the export field set, metadata, full I/O and
 * both score aggregates, newest first and at most `rowLimit` rows.
 *
 * Input: `filter` as stored on the export; `positionInTrace` leaves are
 * dropped, comment filters must already be resolved to event IDs.
 *
 * Output: the compiled query and `startTimeFrom`, the filters' lower
 * `startTime` bound as ClickHouse text (or null), which bounds both score
 * scans here and the caller's distinct-score-names read.
 *
 * Behavior: observation-score filters match a score at observation or trace
 * level (`events-score-predicate.ts`). Both score aggregates are always
 * joined and read every score name, since the export projects them all.
 *
 * Errors: `InvalidRequestError` for an unresolved comment filter, a search
 * without a search type, or a score filter of the wrong type or operator;
 * `QueryCompileError` for a filter the events predicate cannot lower.
 */
export const buildEventsBlobExportStreamQuery = ({
  projectId,
  cutoffCreatedAt,
  filter,
  searchQuery,
  searchType,
  rowLimit,
}: EventsStreamQueryInput): EventsBlobExportStreamQuery => {
  const filterGroups = groupEventsObservationFilters(
    streamFilterConditions(filter, cutoffCreatedAt),
  );
  assertEventsRowSelectionLowerable(filterGroups, searchQuery, searchType);
  const { predicate, search } = fromFilterState({
    filter: filterGroups.events,
    searchQuery,
    searchType,
  });
  const startTimeFrom = startTimeFromOf(startTimeBoundsOf(predicate));
  const query = blobExportRowsQuery({
    predicate,
    search,
    scoreConditions: scoreConditionsOf(filterGroups),
    startTimeFrom,
    skipScoresDedup: shouldSkipScoresDedup(projectId),
    rowLimit,
  });
  const { sql, params } = compileClickhouseQuery(query, projectId);
  return { query: sql, params, startTimeFrom };
};

/**
 * The export rows, uncompiled: events with both score aggregates joined,
 * filtered by `predicate`, `scoreConditions` and `search`, newest first, one
 * row per span, at most `rowLimit`.
 */
function blobExportRowsQuery({
  predicate,
  search,
  scoreConditions,
  startTimeFrom,
  skipScoresDedup,
  rowLimit,
}: {
  predicate: PredicateAnd;
  search: PredicateSearch | undefined;
  scoreConditions: PredicateCondition[];
  startTimeFrom: string | null;
  skipScoresDedup: boolean;
  rowLimit: number;
}) {
  return (
    getClickhouseKysely()
      .with("scores_agg", (qb) =>
        observationScoresAggregate(qb, startTimeFrom, skipScoresDedup),
      )
      .with("trace_scores_agg", (qb) =>
        traceScoresAggregate(qb, startTimeFrom, skipScoresDedup),
      )
      .selectFrom("events as e")
      // On the trace too, unlike the planner's join on `s.observation_id` alone.
      .leftJoin("scores_agg as s", (join) =>
        join
          .onRef("s.trace_id", "=", "e.trace_id")
          .onRef("s.observation_id", "=", "e.span_id"),
      )
      .leftJoin("trace_scores_agg as ts", (join) =>
        join
          .onRef("ts.trace_id", "=", "e.trace_id")
          .onRef("ts.project_id", "=", "e.project_id"),
      )
      .select(eventsRowFieldSelects(eventsFieldSetKeys("export", "metadata")))
      .select([
        "e.input as input",
        "e.output as output",
        "s.scores_avg as scores_avg",
        "s.score_categories as score_categories",
        "s.score_categories_tuples as score_categories_tuples",
        "ts.scores_avg as trace_scores_avg",
        "ts.score_categories_tuples as trace_score_categories_tuples",
      ])
      .$if(predicate.children.length > 0, (qb) =>
        qb.where((eb) => lowerEventsPredicate(eb, predicate)),
      )
      .$if(scoreConditions.length > 0, (qb) =>
        qb.where((eb) =>
          eb.and(
            scoreConditions.map((condition) =>
              lowerEventsScoreCondition(eb, condition),
            ),
          ),
        ),
      )
      .$if(search !== undefined, (qb) =>
        qb.where((eb) => lowerEventsSearch(eb, search!)),
      )
      .orderBy("e.project_id", "desc")
      .orderBy((eb) => toStartOfMinute(eb.ref("e.start_time")), "desc")
      .orderBy("e.start_time", "desc")
      .$call(
        limitBy({
          count: 1,
          columns: (eb) => [eb.ref("e.span_id"), eb.ref("e.project_id")],
        }),
      )
      .limit(rowLimit)
  );
}

/**
 * The score filters as predicate conditions, observation scores before trace
 * scores; the legacy `scores` column resolves to the typed score field of
 * its filter type.
 */
function scoreConditionsOf(filterGroups: EventsObservationFilterGroups) {
  return [...filterGroups.observationScores, ...filterGroups.traceScores].map(
    (scoreFilter) =>
      conditionFromFilter({
        ...scoreFilter,
        column: resolveLegacyScoreFilterColumn(
          scoreFilter,
          eventsTableUiColumnDefinitions,
        ),
      }),
  );
}

/** The per-score rows a score aggregate groups, as its subquery `tmp`. */
type ScoreRowsBuilder = ExpressionBuilder<
  {
    tmp: {
      name: string;
      data_type: string;
      string_value: string | null;
      avg_value: number;
    };
  },
  "tmp"
>;

/**
 * The score arrays of one score aggregate, from `buildScoresAggregationCTE`
 * (query-fragments.ts) with its tuple encoding:
 * `scores_avg` (numeric and boolean scores as `(name, avg_value, data_type,
 * string_value)`), `score_categories` (`'<name>:<value>'`), `score_booleans`
 * (`'<name>:true|false'`) and `score_categories_tuples` (`(name, value,
 * data_type)`, safe to parse when a name contains a colon).
 */
const scoreArraySelects = (eb: ScoreRowsBuilder) => {
  const categorical = eb.and([
    eb("data_type", "in", [literal("CATEGORICAL"), literal("TEXT")]),
    notEmpty(eb.ref("string_value")),
  ]);
  return [
    groupArrayIf(
      tuple(
        eb.ref("name"),
        eb.ref("avg_value"),
        eb.ref("data_type"),
        eb.ref("string_value"),
      ),
      eb("data_type", "in", [literal("NUMERIC"), literal("BOOLEAN")]),
    ).as("scores_avg"),
    groupArrayIf(
      concat(eb.ref("name"), literal(":"), eb.ref("string_value")),
      categorical,
    ).as("score_categories"),
    // Encoded like `encodeBooleanScoreEntry`, which the score filters match
    // with `has`; `scoreBooleansAggregation` (query-fragments.ts) is the
    // raw-SQL copy. BOOLEAN scores also stay in `scores_avg`, for numeric
    // filters.
    groupUniqArrayIf(
      concat(eb.ref("name"), literal(":"), lowerUTF8(eb.ref("string_value"))),
      eb.and([
        eb("data_type", "=", literal("BOOLEAN")),
        notEmpty(eb.ref("string_value")),
      ]),
    ).as("score_booleans"),
    groupArrayIf(
      tuple(eb.ref("name"), eb.ref("string_value"), eb.ref("data_type")),
      categorical,
    ).as("score_categories_tuples"),
  ];
};

/** The builder of a select over the `scores` table alone, unaliased. */
type ScoresTableBuilder = ExpressionBuilder<ClickHouseDatabase, "scores">;

/**
 * `timestamp >= <startTimeFrom> - <lookback…>` over `scores`, from
 * `scoreTimestampLowerBound` (query-fragments.ts): `startTimeFrom` binds as
 * the legacy `DateTime64(3)` text, and the lookback stays SQL arithmetic.
 */
const scoreTimestampLowerBound = (
  eb: ScoresTableBuilder,
  startTimeFrom: string,
  lookback: ReadonlyArray<Expression<IntervalValue>>,
) =>
  eb(
    "timestamp",
    ">=",
    lookback.reduce<Expression<Date>>(
      minusInterval,
      typedValue<Date>(startTimeFrom, "DateTime64(3)"),
    ),
  );

/**
 * The observation score aggregate `scores_agg`: one row per
 * (`observation_id`, `trace_id`) with {@link scoreArraySelects}, over scores
 * from an hour before `startTimeFrom` on, FINAL unless `skipDedup`.
 */
function observationScoresAggregate(
  qb: QueryCreator<ClickHouseDatabase>,
  startTimeFrom: string | null,
  skipDedup: boolean,
) {
  return qb
    .selectFrom((eb) =>
      eb
        .selectFrom("scores")
        .$if(!skipDedup, useFinal(["scores"]))
        .select([
          "observation_id",
          "trace_id",
          "comment",
          "name",
          "data_type",
          "string_value",
        ])
        .select((inner) => inner.fn.avg("value").as("avg_value"))
        .$if(startTimeFrom !== null, (inner) =>
          inner.where((web) =>
            scoreTimestampLowerBound(web, startTimeFrom!, [
              interval(SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_HOURS, "hour"),
            ]),
          ),
        )
        .groupBy([
          "observation_id",
          "trace_id",
          "comment",
          "name",
          "data_type",
          "string_value",
        ])
        .orderBy("trace_id")
        .as("tmp"),
    )
    .select(["trace_id", "observation_id"])
    .select(scoreArraySelects)
    .groupBy(["observation_id", "trace_id"]);
}

/**
 * The trace score aggregate `trace_scores_agg`: one row per (`project_id`,
 * `trace_id`) of the scores without an observation, with their ids and
 * {@link scoreArraySelects}, over scores from two days and an hour before
 * `startTimeFrom` on (trace-to-observation skew, then the score lookback),
 * FINAL unless `skipDedup`.
 */
function traceScoresAggregate(
  qb: QueryCreator<ClickHouseDatabase>,
  startTimeFrom: string | null,
  skipDedup: boolean,
) {
  return qb
    .selectFrom((eb) =>
      eb
        .selectFrom("scores")
        .$if(!skipDedup, useFinal(["scores"]))
        .select([
          "project_id",
          "trace_id",
          "id",
          "name",
          "data_type",
          "string_value",
        ])
        .select((inner) => inner.fn.avg("value").as("avg_value"))
        .where("observation_id", "is", null)
        .$if(startTimeFrom !== null, (inner) =>
          inner.where((web) =>
            scoreTimestampLowerBound(web, startTimeFrom!, [
              interval(OBSERVATIONS_TO_TRACE_INTERVAL_DAYS, "day"),
              interval(SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_HOURS, "hour"),
            ]),
          ),
        )
        .groupBy([
          "project_id",
          "trace_id",
          "id",
          "name",
          "data_type",
          "string_value",
        ])
        .as("tmp"),
    )
    .select((eb) => [
      "trace_id",
      "project_id",
      groupUniqArray(eb.ref("id")).as("score_ids"),
    ])
    .select(scoreArraySelects)
    .groupBy(["project_id", "trace_id"]);
}
