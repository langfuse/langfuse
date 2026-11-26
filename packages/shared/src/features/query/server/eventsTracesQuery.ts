/**
 * The v2 traces view's query on the query AST ({@link buildEventsTraces}):
 * its FROM, `scores` join and WHERE, the root-event condition, and its
 * dimension and measure selections, read from the entries of
 * `eventsTracesRegistry.ts`. The steps it shares with the other views are in
 * `viewQuerySteps.ts`; `QueryBuilder` dispatches the view here.
 */
import { expressionBuilder, type Expression, type SqlBool } from "kysely";
import { type QueryType, type ViewVersion } from "../types";
import { eventsTracesView } from "../dataModel";
import { conditionFromFilter } from "../../../query-ast/filterStateCodec";
import type { PredicateCondition } from "../../../query-ast/predicate";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { QueryCompileError } from "../../../server/query-ast/errors";
import {
  anyIf,
  ifNull,
  literal,
  toNullable,
  useFinal,
} from "../../../server/query-ast/extensions";
import { lowerEventsFieldCondition } from "../../../server/repositories/events-predicate";
import {
  eventsIsRootObservation,
  type EventsExpressionBuilder,
} from "../../../server/repositories/events-selects";
import {
  eventsTracesDimension,
  eventsTracesFilterLowering,
  eventsTracesMeasure,
  eventsTracesScoresJoin,
  type TracesBuilder,
  type TracesDb,
} from "./eventsTracesRegistry";
import { type QueryLevel } from "./registryEntry";
import {
  type AppliedDimensionType,
  type AppliedMetricType,
  type BucketValues,
  type TimeBucketOf,
  type TimeWindow,
  HOUR_MS,
  utcDateTime,
  assertKnownRelationTables,
  atLevel,
  applyBucketingDimension,
  mapDimensions,
  mapMetrics,
  withRequiredDimensions,
  validateFilters,
  collectRelationTables,
  canUseSingleLevelQuery,
  validateAndProcessOrderBy,
  astOuterClauses,
  astOuterSelect,
  compileWithOuterClauses,
  dimensionAlias,
  astBucketSelection,
  astSingleLevelMetrics,
  astInnerMetrics,
} from "./viewQuerySteps";

/**
 * A dashboard filter, lowered to its WHERE conjuncts. `pruning` tells the
 * filters on a dimension with `prunedBy` columns (`name`) apart: their
 * conjuncts follow the time windows, the others precede them.
 */
type TracesFilter = { pruning: boolean; conjuncts: Expression<SqlBool>[] };

/**
 * `QueryBuilder.build` for the v2 traces view: a dashboard widget or metrics
 * API query over traces, where each trace is aggregated from its events (one
 * row per trace in the inner select, then the widget's aggregation).
 *
 * Level: single-level only with `enableSingleLevelOptimization`, no measure
 * and at most the `id` dimension (`canUseSingleLevelQuery`: every measure
 * aggregates per trace, every other dimension declares a per-trace
 * aggregation).
 *
 * Rows: the traces with an event in the query window; on a window of at most
 * `rootEventConditionMaxWindowHours` (0: every window), only the traces whose
 * root event starts in it ({@link rootEventCondition}).
 *
 * `skipScoresFinal`: the project never updates its scores
 * (`shouldSkipScoresDedup`), so the `scoresCount` join reads `scores` without
 * `FINAL` and drops deleted scores in its ON clause instead. `version` and
 * `chartConfig` (histogram bins, row limit) are the `QueryBuilder`'s.
 */
export function buildEventsTraces(
  query: QueryType,
  projectId: string,
  enableSingleLevelOptimization: boolean,
  skipScoresFinal: boolean,
  version: ViewVersion,
  chartConfig: { bins?: number; row_limit?: number } | undefined,
  rootEventConditionMaxWindowHours: number,
): { query: string; parameters: Record<string, unknown> } {
  const view = eventsTracesView;
  const requestedDimensions = mapDimensions(query.dimensions, view);
  const appliedMetrics = mapMetrics(query.metrics, view);
  const bucket = applyBucketingDimension(query, view, version);
  const appliedDimensions = withRequiredDimensions(
    requestedDimensions,
    appliedMetrics,
    view,
  );
  validateFilters(query.filters, view);
  const filters = query.filters.map((filter) =>
    lowerTracesFilter(filter.column, conditionFromFilter(filter)),
  );

  // No filter joins a relation: every filter lowering compares `e` columns.
  const relationTables = collectRelationTables(
    appliedDimensions,
    appliedMetrics,
    bucket,
  );
  assertKnownRelationTables(view, relationTables);
  const level: QueryLevel =
    enableSingleLevelOptimization &&
    canUseSingleLevelQuery(appliedDimensions, appliedMetrics)
      ? "single"
      : "two";
  const orderBy = validateAndProcessOrderBy(
    query.orderBy,
    appliedDimensions,
    appliedMetrics,
    bucket,
  );
  const window: TimeWindow = {
    from: utcDateTime(new Date(query.fromTimestamp)),
    to: utcDateTime(new Date(query.toTimestamp)),
  };
  const windowHours =
    (new Date(query.toTimestamp).getTime() -
      new Date(query.fromTimestamp).getTime()) /
    HOUR_MS;
  const source = astTracesSource({
    window,
    filters,
    joinsScores: relationTables.has("scores"),
    skipScoresFinal,
    // The condition scans the window a second time; on a long window the
    // traces it drops, whose root event starts before the window, are few.
    restrictToRootEvents:
      rootEventConditionMaxWindowHours === 0 ||
      windowHours <= rootEventConditionMaxWindowHours,
  });
  const outerClauses = astOuterClauses(
    query,
    appliedDimensions,
    bucket,
    orderBy,
    chartConfig?.row_limit,
  );
  const bucketValue = (eb: TracesBuilder): BucketValues => ({
    time: eb.ref("e.start_time"),
    entity: (field) => eventsTracesDimension(field).expression(eb),
    perEntityTime: (bucketOf) => rootEventTimeBucket(eb, bucketOf),
  });

  if (level === "single") {
    return compileWithOuterClauses(
      projectId,
      outerClauses,
      source.select((eb) => [
        ...appliedDimensions.map((d) =>
          eventsTracesDimension(d.name).expression(eb).as(dimensionAlias(d)),
        ),
        ...astBucketSelection(bucket, "single", bucketValue(eb)),
        ...astSingleLevelMetrics(
          eb,
          appliedMetrics,
          singleLevelMeasure,
          chartConfig?.bins,
        ),
      ]),
    );
  }
  const perTrace = source
    .select(["e.project_id", "e.trace_id"])
    .select((eb) => [
      ...appliedDimensions.map((d) => perTraceDimension(eb, d)),
      ...astBucketSelection(bucket, "two", bucketValue(eb)),
      ...astInnerMetrics(eb, appliedMetrics, (metric) =>
        eventsTracesMeasure(metric.measureName, metric.aggregation).expression(
          eb,
        ),
      ),
    ])
    .groupBy(["e.project_id", "e.trace_id"]);
  return compileWithOuterClauses(
    projectId,
    outerClauses,
    astOuterSelect(
      perTrace.as("per_trace"),
      appliedDimensions,
      bucket,
      appliedMetrics,
      chartConfig?.bins,
    ),
  );
}

/**
 * A dashboard filter on `column` as WHERE conjuncts over `e`. The trace name
 * is an expression no skip index covers, so a `name` filter first applies
 * the same condition to its `prunedBy` columns, ORed, for their indexes to
 * skip granules; its own condition then decides which events match. Throws
 * `InvalidRequestError` for a column the view has no filter for.
 */
function lowerTracesFilter(
  column: string,
  condition: PredicateCondition,
): TracesFilter {
  const eb = expressionBuilder<TracesDb, "e">();
  const { filter, prunedBy } = eventsTracesFilterLowering(column);
  const own = lowerEventsFieldCondition(eb, filter, condition);
  if (!prunedBy) return { pruning: false, conjuncts: own };
  const pruned = eb.or(
    prunedBy.map((column) =>
      eb.and(lowerEventsFieldCondition(eb, column, condition)),
    ),
  );
  return { pruning: true, conjuncts: [pruned, ...own] };
}

/**
 * The events a v2 traces query aggregates: those in the window that pass the
 * filters, joined with their scores when a measure counts them. `name`
 * filters come after the time windows, the other filters before them.
 */
function astTracesSource({
  window,
  filters,
  joinsScores,
  skipScoresFinal,
  restrictToRootEvents,
}: {
  window: TimeWindow;
  filters: TracesFilter[];
  joinsScores: boolean;
  skipScoresFinal: boolean;
  restrictToRootEvents: boolean;
}) {
  let events = getClickhouseKysely().selectFrom("events as e");
  for (const { conjuncts } of filters.filter((f) => !f.pruning)) {
    for (const conjunct of conjuncts) events = events.where(conjunct);
  }
  events = events
    .where("e.start_time", ">=", window.from)
    .where("e.start_time", "<=", window.to);

  let joined = events.$if(joinsScores, (qb) => {
    const withScores = qb
      .innerJoin("scores", (join) =>
        join.on((eb) =>
          eventsTracesScoresJoin(eb, { liveScoresOnly: skipScoresFinal }),
        ),
      )
      .where("scores.timestamp", ">=", window.from)
      .where("scores.timestamp", "<=", window.to);
    return skipScoresFinal
      ? withScores
      : withScores.$call(useFinal(["scores"]));
  });
  for (const { conjuncts } of filters.filter((f) => f.pruning)) {
    for (const conjunct of conjuncts) joined = joined.where(conjunct);
  }
  return restrictToRootEvents
    ? joined.where((eb) => rootEventCondition(eb, window))
    : joined;
}

/**
 * The traces whose root event starts in the window. A new tree per call,
 * since the condition reads it twice. It reads no truncated column, so it
 * stays on `events_core` when a metadata filter routes the outer read to
 * `events_full`.
 */
function rootEventTraceIds(window: TimeWindow) {
  return getClickhouseKysely()
    .selectFrom("events as e")
    .select("e.trace_id")
    .where((eb) => eventsIsRootObservation(eb))
    .where("e.start_time", ">=", window.from)
    .where("e.start_time", "<=", window.to);
}

/**
 * Keeps the traces whose root event starts in the window, since a trace's
 * time is its root event's start (the timestamp of the v1 `traceView`):
 * drops a trace that has events in the window but whose root event starts
 * outside it or is missing. A window
 * without any root event (a project whose events never set
 * `parent_span_id`) keeps every trace.
 */
function rootEventCondition(
  eb: EventsExpressionBuilder,
  window: TimeWindow,
): Expression<SqlBool> {
  return eb.or([
    eb("e.trace_id", "in", rootEventTraceIds(window)),
    eb.not(eb.exists(rootEventTraceIds(window).limit(literal(1)))),
  ]);
}

/**
 * A trace's time bucket in a two-level query: the bucket its root event
 * starts in, so a trace whose events cross a bucket boundary lands where it
 * started. A trace without a root event in the window takes its earliest
 * event's bucket.
 */
function rootEventTimeBucket(eb: TracesBuilder, bucketOf: TimeBucketOf) {
  return ifNull(
    anyIf(
      toNullable(bucketOf(eb.ref("e.start_time"))),
      eventsIsRootObservation(eb),
    ),
    eb.fn.min(bucketOf(eb.ref("e.start_time"))),
  );
}

/**
 * A dimension in the inner select of a two-level query: its per-trace
 * value, or `any(<row value>)` for the group key `id`.
 */
function perTraceDimension(eb: TracesBuilder, dimension: AppliedDimensionType) {
  const entry = eventsTracesDimension(dimension.name);
  const value = entry.perTrace
    ? entry.perTrace(eb)
    : atLevel(entry.expression(eb), "two");
  return value.as(dimensionAlias(dimension));
}

/**
 * Throws: a single-level query has no measure, since every measure is a
 * per-trace aggregate (`canUseSingleLevelQuery`).
 */
function singleLevelMeasure(metric: AppliedMetricType): never {
  throw new QueryCompileError(
    `Measure "${metric.measureName}" aggregates per trace, so it needs a two-level query.`,
  );
}
