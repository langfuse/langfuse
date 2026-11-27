/**
 * The v2 score views' query on the query AST ({@link buildScores}): its FROM,
 * joins and WHERE, read from the score registry entries. The
 * view-independent steps (dimension and metric mapping, outer clauses) are in
 * `viewQuerySteps.ts`; `QueryBuilder` dispatches the score views here.
 */
import type { SelectQueryBuilder, Expression, SqlBool } from "kysely";
import type { PredicateCondition } from "../../../query-ast/predicate";
import type { FieldLowering } from "../../../server/repositories/events-predicate-fields";
import {
  SCORE_V2_RELATIONS,
  scoresNumericViewV2,
  scoresCategoricalViewV2,
  scoresBooleanViewV2,
  scoresListableCountViewV2,
} from "../dataModel";
import type { QueryType, ViewDeclarationType, ViewVersion } from "../types";
import {
  SEGMENT_FILTER,
  scoresExpressionBuilder,
  scoreDimension,
  type ScoresBuilder,
  scoreMeasure,
  scoreFilterLowering,
} from "./scoresRegistry";
import { conditionFromFilter } from "../../../query-ast/filterStateCodec";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { lowerFieldCondition } from "../../../server/repositories/events-predicate";
import {
  eventsTraceAttributes,
  TRACE_ATTRIBUTE_COLUMNS,
} from "./eventsTraceAttributes";
import { useFinal } from "../../../server/query-ast/extensions";
import type { QueryLevel } from "./registryEntry";
import {
  filterDimensionName,
  assertKnownRelationTables,
  type BucketValues,
  type TimeWindow,
  type AppliedMetricType,
  type AppliedDimensionType,
  atLevel,
  utcDateTime,
  applyBucketingDimension,
  astBucketSelection,
  astInnerMetrics,
  astOuterClauses,
  astOuterSelect,
  astSingleLevelMetrics,
  canUseSingleLevelQuery,
  collectRelationTables,
  compileWithOuterClauses,
  dimensionAlias,
  mapDimensions,
  mapMetrics,
  validateAndProcessOrderBy,
  validateFilters,
  withRequiredDimensions,
} from "./viewQuerySteps";

/**
 * A dashboard filter on a v2 score view: the lowering and condition, the
 * dimension it names (none for `timestamp` and `metadata`), and that
 * dimension's relation (none for a `scores` column).
 */
type ScoreFilter = {
  lowering: FieldLowering<ScoresBuilder>;
  condition: PredicateCondition;
  dimension: string | undefined;
  relation: string | undefined;
};

const SCORE_TRACES = SCORE_V2_RELATIONS.traces;

const SCORE_OBSERVATIONS = SCORE_V2_RELATIONS.observations;

/** The views `QueryBuilder.build` compiles through `buildScores`. */
export const SCORE_VIEWS_V2: ReadonlySet<ViewDeclarationType> = new Set([
  scoresNumericViewV2,
  scoresCategoricalViewV2,
  scoresBooleanViewV2,
  scoresListableCountViewV2,
]);

/** `query` with each of `conditions` ANDed to its WHERE, in order. */
function whereAll<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  conditions: ReadonlyArray<Expression<SqlBool>>,
): SelectQueryBuilder<DB, TB, O> {
  let filtered = query;
  for (const condition of conditions) filtered = filtered.where(condition);
  return filtered;
}

/**
 * What the parts of the v2 score query's FROM and WHERE read: the query's
 * time window, its dashboard filters and the view's segments.
 */
type ScoresSourceScope = {
  window: TimeWindow;
  filters: ScoreFilter[];
  segments: ViewDeclarationType["segments"];
};

const isTraceFilter = (filter: ScoreFilter) => filter.relation === SCORE_TRACES;

/** Each of `filters` as its WHERE conjuncts, in order. */
function lowerScoreFilters(filters: ScoreFilter[]) {
  const eb = scoresExpressionBuilder();
  return filters.flatMap((f) =>
    lowerFieldCondition(eb, f.lowering, f.condition),
  );
}

/** `scores.timestamp between <from> and <to> and <segment>` */
function scoreWindowAndSegment({ window, segments }: ScoresSourceScope) {
  const eb = scoresExpressionBuilder();
  return [
    eb("scores.timestamp", ">=", window.from),
    eb("scores.timestamp", "<=", window.to),
    ...segments.flatMap((segment) =>
      lowerFieldCondition(eb, SEGMENT_FILTER, conditionFromFilter(segment)),
    ),
  ];
}

/**
 * `select scores.trace_id from scores where <score filters> and <window> and
 * <segment>`, without FINAL: it only narrows trace ids.
 */
function scoredTraceIds(scope: ScoresSourceScope) {
  return whereAll(
    getClickhouseKysely().selectFrom("scores").select("scores.trace_id"),
    [
      ...lowerScoreFilters(
        scope.filters.filter((f) => f.relation === undefined),
      ),
      ...scoreWindowAndSegment(scope),
    ],
  );
}

/** The trace attributes subquery with the columns `dimensions` read. */
function traceAttributesFor(window: TimeWindow, dimensions: string[]) {
  return eventsTraceAttributes(
    window,
    TRACE_ATTRIBUTE_COLUMNS.filter((column) =>
      dimensions.some((d) => scoreDimension(d).traceColumn === column),
    ),
  );
}

/** The dimensions the trace filters in `filters` name. */
const traceFilterDimensions = (filters: ScoreFilter[]) =>
  filters.flatMap((f) =>
    isTraceFilter(f) && f.dimension ? [f.dimension] : [],
  );

/**
 * `from scores [inner join <relation> on …]…`, one join per relation in
 * `joined`, in order. The trace join selects the trace columns of
 * `traceDimensions` and of the trace filters.
 */
function scoresJoins(
  scope: ScoresSourceScope,
  joined: string[],
  traceDimensions: string[],
) {
  const db = getClickhouseKysely();
  let source = db.selectFrom("scores");
  for (const relation of joined) {
    source = source
      // … inner join events as e on <score's observation>
      .$if(relation === SCORE_OBSERVATIONS, (qb) =>
        qb.innerJoin("events as e", (join) =>
          join
            .onRef("scores.project_id", "=", "e.project_id")
            .onRef("scores.trace_id", "=", "e.trace_id")
            .onRef("scores.observation_id", "=", "e.span_id"),
        ),
      )
      // … inner join (select * from (<trace attributes>) as events_traces_all
      // where events_traces_all.id in (<scored trace ids>)) as events_traces on …
      .$if(relation === SCORE_TRACES, (qb) =>
        qb.innerJoin(
          db
            .selectFrom(
              traceAttributesFor(scope.window, [
                ...traceDimensions,
                ...traceFilterDimensions(scope.filters),
              ]).as("events_traces_all"),
            )
            .selectAll()
            .where("events_traces_all.id", "in", scoredTraceIds(scope))
            .as("events_traces"),
          (join) =>
            join
              .onRef("scores.trace_id", "=", "events_traces.id")
              .onRef("scores.project_id", "=", "events_traces.project_id"),
        ),
      );
  }
  return source;
}

/**
 * `scores.trace_id in (select events_traces.id from (<trace attributes>) as
 * events_traces where <trace filters> and events_traces.id in (<scored trace
 * ids>))`
 */
function traceSemiJoin(scope: ScoresSourceScope) {
  const eb = scoresExpressionBuilder();
  return eb(
    "scores.trace_id",
    "in",
    whereAll(
      getClickhouseKysely()
        .selectFrom(
          traceAttributesFor(
            scope.window,
            traceFilterDimensions(scope.filters),
          ).as("events_traces"),
        )
        .select("events_traces.id"),
      [
        ...lowerScoreFilters(scope.filters.filter(isTraceFilter)),
        eb("events_traces.id", "in", scoredTraceIds(scope)),
      ],
    ),
  );
}

/**
 * The WHERE conjuncts of the v2 score query: `<filters> and <window> and
 * <segment> [and e.start_time between <from> and <to>] [and <trace
 * semi-join>]`. Trace filters move into the {@link traceSemiJoin} when
 * `joined` lacks the trace relation, and the observation window applies when
 * it has the observation relation.
 */
function scoresWhere(scope: ScoresSourceScope, joined: string[]) {
  const eb = scoresExpressionBuilder();
  const semiJoinsTraces =
    !joined.includes(SCORE_TRACES) && scope.filters.some(isTraceFilter);
  return [
    ...lowerScoreFilters(
      scope.filters.filter((f) => !(semiJoinsTraces && isTraceFilter(f))),
    ),
    ...scoreWindowAndSegment(scope),
    ...(joined.includes(SCORE_OBSERVATIONS)
      ? [
          eb("e.start_time", ">=", scope.window.from),
          eb("e.start_time", "<=", scope.window.to),
        ]
      : []),
    ...(semiJoinsTraces ? [traceSemiJoin(scope)] : []),
  ];
}

/**
 * `QueryBuilder.build` for the v2 score views, on the query AST: the shapes of
 * `buildEventsObservations` over `from scores [final]`, with the
 * entries of `scoresRegistry.ts` and filters lowered by
 * `lowerFieldCondition`. Tenancy adds the project conditions. Rows flagged
 * deleted are read, as the string builder does.
 *
 * The view's two relations:
 * - `events_observations` joins `events as e` on the score's observation,
 *   with `e.start_time` in the query window;
 * - `events_traces` joins the trace attributes (`eventsTraceAttributes`)
 *   of the traces that have a score passing the query's score filters.
 *   When the query only filters on it, it becomes a semi-join instead:
 *   `scores.trace_id in (<ids of matching traces>)`, last in WHERE.
 *
 * Level: single-level only without a join, whatever
 * `enableSingleLevelOptimization` says: a join can match several rows per
 * score, so the inner select groups by score to count each score once.
 *
 * `version` and `chartConfig` (histogram bins, row limit) are the
 * `QueryBuilder`'s.
 */
export function buildScores(
  query: QueryType,
  view: ViewDeclarationType,
  projectId: string,
  skipScoresFinal: boolean,
  version: ViewVersion,
  chartConfig: { bins?: number; row_limit?: number } | undefined,
): { query: string; parameters: Record<string, unknown> } {
  const requestedDimensions = mapDimensions(query.dimensions, view);
  const appliedMetrics = mapMetrics(query.metrics, view);
  const bucket = applyBucketingDimension(query, view, version);
  const appliedDimensions = withRequiredDimensions(
    requestedDimensions,
    appliedMetrics,
    view,
  );
  validateFilters(query.filters, view);
  const filters = query.filters.map((filter): ScoreFilter => {
    const dimension = filterDimensionName(filter.column, view.dimensions);
    return {
      lowering: scoreFilterLowering(filter.column, dimension, view.dimensions),
      condition: conditionFromFilter(filter),
      dimension,
      relation: dimension
        ? view.dimensions[dimension].relationTable
        : undefined,
    };
  });

  // Relations in order of first use: entity bucket, dimensions, measures,
  // filters.
  const outputRelations = collectRelationTables(
    appliedDimensions,
    appliedMetrics,
    bucket,
  );
  const relations = new Set([
    ...outputRelations,
    ...filters.flatMap((f) => (f.relation ? [f.relation] : [])),
  ]);
  assertKnownRelationTables(view, relations);
  const semiJoinsTraces =
    relations.has(SCORE_TRACES) && !outputRelations.has(SCORE_TRACES);
  const joined = [...relations].filter(
    (relation) => !(semiJoinsTraces && relation === SCORE_TRACES),
  );
  const level: QueryLevel =
    joined.length === 0 &&
    canUseSingleLevelQuery(appliedDimensions, appliedMetrics)
      ? "single"
      : "two";
  const orderBy = validateAndProcessOrderBy(
    query.orderBy,
    appliedDimensions,
    appliedMetrics,
    bucket,
  );
  const outerClauses = astOuterClauses(
    query,
    appliedDimensions,
    bucket,
    orderBy,
    chartConfig?.row_limit,
  );
  const eb = scoresExpressionBuilder();
  const source = astScoresSource(query, view, {
    filters,
    joined,
    skipScoresFinal,
    traceDimensions: [
      ...appliedDimensions.map((d) => d.name),
      ...(bucket.type === "entity" ? [bucket.field] : []),
    ],
  });
  const bucketValues: BucketValues = {
    time: eb.ref("scores.timestamp"),
    entity: (field) => scoreDimension(field).expression(eb),
  };
  const measure = (level: QueryLevel) => (metric: AppliedMetricType) =>
    scoreMeasure(eb, metric.measureName, level);
  const dimensionValue = (d: AppliedDimensionType, level: QueryLevel) =>
    atLevel(scoreDimension(d.name).expression(eb), level).as(dimensionAlias(d));

  if (level === "single") {
    // select <dimensions>, <bucket>, <aggregation>(<measure>) … from <source>
    return compileWithOuterClauses(
      projectId,
      outerClauses,
      source.select(() => [
        ...appliedDimensions.map((d) => dimensionValue(d, "single")),
        ...astBucketSelection(bucket, "single", bucketValues),
        ...astSingleLevelMetrics(
          eb,
          appliedMetrics,
          measure("single"),
          chartConfig?.bins,
        ),
      ]),
    );
  }
  // select scores.project_id, scores.id, any(<dimension>) …, <measures> from <source>
  // group by scores.project_id, scores.id
  const perScore = source
    .select(["scores.project_id", "scores.id"])
    .select(() => [
      ...appliedDimensions.map((d) => dimensionValue(d, "two")),
      ...astBucketSelection(bucket, "two", bucketValues),
      ...astInnerMetrics(eb, appliedMetrics, measure("two")),
    ])
    .groupBy(["scores.project_id", "scores.id"]);
  return compileWithOuterClauses(
    projectId,
    outerClauses,
    astOuterSelect(
      perScore.as("per_score"),
      appliedDimensions,
      bucket,
      appliedMetrics,
      chartConfig?.bins,
    ),
  );
}

/**
 * The FROM, JOINs and WHERE of the v2 score query: {@link scoresJoins}
 * `where` {@link scoresWhere} `[final]`. `traceDimensions` are the output
 * dimensions, whose trace attributes the trace join selects.
 */
function astScoresSource(
  query: QueryType,
  view: ViewDeclarationType,
  {
    filters,
    joined,
    skipScoresFinal,
    traceDimensions,
  }: {
    filters: ScoreFilter[];
    joined: string[];
    skipScoresFinal: boolean;
    traceDimensions: string[];
  },
) {
  const scope: ScoresSourceScope = {
    window: {
      from: utcDateTime(new Date(query.fromTimestamp)),
      to: utcDateTime(new Date(query.toTimestamp)),
    },
    filters,
    segments: view.segments,
  };
  const filtered = whereAll(
    scoresJoins(scope, joined, traceDimensions),
    scoresWhere(scope, joined),
  );
  return skipScoresFinal ? filtered : filtered.$call(useFinal(["scores"]));
}
