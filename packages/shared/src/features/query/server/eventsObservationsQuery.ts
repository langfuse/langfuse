/**
 * The v2 observations view's query on the query AST
 * ({@link buildEventsObservations}): its FROM, `scores` join, ARRAY JOIN and
 * WHERE, and its dimension and measure selections, read from the entries of
 * `eventsObservationsRegistry.ts`. The steps it shares with the other views
 * are in `viewQuerySteps.ts`; `QueryBuilder` dispatches the view here.
 */
import { expressionBuilder, type AliasableExpression } from "kysely";
import { type QueryType, type ViewVersion } from "../types";
import { eventsObservationsView } from "../dataModel";
import { conditionFromFilter } from "../../../query-ast/filterStateCodec";
import type { PredicateCondition } from "../../../query-ast/predicate";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import {
  aliasRef,
  arrayJoin,
  arrayJoinElements,
  useFinal,
} from "../../../server/query-ast/extensions";
import { lowerEventsFieldCondition } from "../../../server/repositories/events-predicate";
import type { EventsFieldLowering } from "../../../server/repositories/events-predicate-fields";
import {
  eventsObservationsArrayDimension,
  eventsObservationsDimension,
  eventsObservationsFilterLowering,
  eventsObservationsMeasure,
  eventsObservationsScoresJoin,
  type ObservationsBuilder,
  type ObservationsDb,
} from "./eventsObservationsRegistry";
import { type QueryLevel } from "./registryEntry";
import {
  type AppliedDimensionType,
  type AppliedMetricType,
  utcDateTime,
  assertKnownRelationTables,
  type BucketValues,
  atLevel,
  applyBucketingDimension,
  mapDimensions,
  mapMetrics,
  withRequiredDimensions,
  validateFilters,
  collectRelationTables,
  canUseSingleLevelQuery,
  pairExpandDimension,
  validateAndProcessOrderBy,
  astOuterClauses,
  astOuterSelect,
  compileWithOuterClauses,
  dimensionAlias,
  astBucketSelection,
  astSingleLevelMetrics,
  astInnerMetrics,
} from "./viewQuerySteps";

/** A dashboard filter as the events predicate lowering takes it. */
type DashboardFilter = {
  lowering: EventsFieldLowering;
  condition: PredicateCondition;
};

/**
 * `QueryBuilder.build` for the v2 observations view, on the query AST: the same
 * single- and two-level shapes, with the view's entries from
 * `eventsObservationsRegistry.ts` and its filters lowered by the events
 * predicate lowering. Reads `events_truncated`, so it selects the
 * `events_core` values as the string builder does; a filter that needs
 * untruncated values routes it to `events_full`, where the routing pass
 * cuts the selected truncated columns. Tenancy adds the project
 * conditions. Rows flagged deleted are read, as the string builder does.
 * `version` and `chartConfig` (histogram bins, row limit) are the
 * `QueryBuilder`'s.
 */
export function buildEventsObservations(
  query: QueryType,
  projectId: string,
  enableSingleLevelOptimization: boolean,
  skipScoresFinal: boolean,
  version: ViewVersion,
  chartConfig: { bins?: number; row_limit?: number } | undefined,
): { query: string; parameters: Record<string, unknown> } {
  const view = eventsObservationsView;
  const requestedDimensions = mapDimensions(query.dimensions, view);
  const appliedMetrics = mapMetrics(query.metrics, view);
  const bucket = applyBucketingDimension(query, view, version);
  const appliedDimensions = withRequiredDimensions(
    requestedDimensions,
    appliedMetrics,
    view,
  );
  validateFilters(query.filters, view, { numericMetadata: true });
  const filters = query.filters.map((filter): DashboardFilter => ({
    lowering: eventsObservationsFilterLowering(filter.column),
    condition: conditionFromFilter(filter),
  }));

  // No filter joins a relation: `eventsObservationsFilterLowering` compares
  // `e` columns only.
  const relationTables = collectRelationTables(
    appliedDimensions,
    appliedMetrics,
    bucket,
  );
  assertKnownRelationTables(view, relationTables);
  const pairDimension = pairExpandDimension(appliedDimensions);
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
  const source = astEventsSource(
    query,
    filters,
    relationTables.has("scores"),
    skipScoresFinal,
    pairDimension,
  );
  const outerClauses = astOuterClauses(
    query,
    appliedDimensions,
    bucket,
    orderBy,
    chartConfig?.row_limit,
  );
  const measure =
    (eb: ObservationsBuilder, level: QueryLevel) =>
    (metric: AppliedMetricType) =>
      astMeasureValue(eb, metric, level);
  const bucketValue = (eb: ObservationsBuilder): BucketValues => ({
    time: eb.ref("e.start_time"),
    entity: (field) => eventsObservationsDimension(field).expression(eb),
  });

  if (level === "single") {
    // select <dimensions>, <bucket>, <aggregation>(<measure>) … from <source>
    return compileWithOuterClauses(
      projectId,
      outerClauses,
      source.select((eb) => [
        ...appliedDimensions.map((d) => astDimensionSelection(eb, d, "single")),
        ...astBucketSelection(bucket, "single", bucketValue(eb)),
        ...astSingleLevelMetrics(
          eb,
          appliedMetrics,
          measure(eb, "single"),
          chartConfig?.bins,
        ),
      ]),
    );
  }
  // select e.project_id, e.span_id, <dimensions>, <bucket>, <measures> from <source>
  // group by e.project_id, e.span_id[, <exploded and pair-expanded aliases>]
  const perSpan = source
    .select(["e.project_id", "e.span_id"])
    .select((eb) => [
      ...appliedDimensions.map((d) => astDimensionSelection(eb, d, "two")),
      ...astBucketSelection(bucket, "two", bucketValue(eb)),
      ...astInnerMetrics(eb, appliedMetrics, measure(eb, "two")),
    ])
    .groupBy([
      "e.project_id",
      "e.span_id",
      ...appliedDimensions
        .filter((d) => d.explodeArray || d.pairExpand)
        .map((d) => aliasRef(dimensionAlias(d))),
    ]);
  return compileWithOuterClauses(
    projectId,
    outerClauses,
    astOuterSelect(
      perSpan.as("per_span"),
      appliedDimensions,
      bucket,
      appliedMetrics,
      chartConfig?.bins,
    ),
  );
}

/**
 * The FROM, JOINs, ARRAY JOIN and WHERE of the v2 observations query:
 * `from events_truncated as e [inner join scores [final] on …] [array join …] where
 * <filters> and e.start_time between <from> and <to> [and scores.timestamp
 * between <from> and <to>]`.
 */
function astEventsSource(
  query: QueryType,
  filters: DashboardFilter[],
  joinsScores: boolean,
  skipScoresFinal: boolean,
  pairDimension: AppliedDimensionType | undefined,
) {
  const from = utcDateTime(new Date(query.fromTimestamp));
  const to = utcDateTime(new Date(query.toTimestamp));
  const db = getClickhouseKysely();
  // from events_truncated as e where <filters> and e.start_time between <from> and <to>
  let events = db.selectFrom("events_truncated as e");
  const eventsEb = expressionBuilder(events);
  for (const { lowering, condition } of filters) {
    for (const conjunct of lowerEventsFieldCondition(
      eventsEb,
      lowering,
      condition,
    )) {
      events = events.where(conjunct);
    }
  }
  events = events
    .where("e.start_time", ">=", from)
    .where("e.start_time", "<=", to);

  // … inner join scores [final] on <join> … and scores.timestamp between <from> and <to>
  // The builder stays typed over `e` alone; the one measure that reads
  // `scores` builds it from a builder typed with the join
  // (`astMeasureValue`).
  const joined = events.$if(joinsScores, (qb) => {
    const withScores = qb
      .innerJoin("scores", (join) =>
        join.on((eb) =>
          eventsObservationsScoresJoin(eb, {
            liveScoresOnly: skipScoresFinal,
          }),
        ),
      )
      .where("scores.timestamp", ">=", from)
      .where("scores.timestamp", "<=", to);
    return skipScoresFinal
      ? withScores
      : withScores.$call(useFinal(["scores"]));
  });

  if (!pairDimension) return joined;
  // … array join <keys> as <alias>, <values> as <valueAlias> …
  const { expression, pairExpand } = eventsObservationsArrayDimension(
    pairDimension.name,
    "pairExpand",
  );
  return joined.$call(
    arrayJoin((eb) => ({
      [dimensionAlias(pairDimension)]: expression(eb),
      [pairExpand.valueAlias]: pairExpand.values(eb),
    })),
  );
}

/**
 * A dimension of the single-level select or the inner select of a
 * two-level one. Grouping keys of that select are bare: the ARRAY JOIN
 * alias of a pairExpand dimension, the `arrayJoin(…)` of an exploded one.
 * Other dimensions are `any(…)` in the inner select, whose rows are one per
 * observation.
 */
function astDimensionSelection(
  eb: ObservationsBuilder,
  dimension: AppliedDimensionType,
  level: QueryLevel,
) {
  const alias = dimensionAlias(dimension);
  if (dimension.pairExpand) return getClickhouseKysely().dynamic.ref(alias);
  if (dimension.explodeArray) {
    const { expression } = eventsObservationsArrayDimension(
      dimension.name,
      "explode",
    );
    return arrayJoinElements(expression(eb)).as(alias);
  }
  const value = eventsObservationsDimension(dimension.name).expression(eb);
  return atLevel(value, level).as(alias);
}

/**
 * A measure's value at `level`. A measure that reads a dimension's ARRAY
 * JOIN alias is `any(…)` in the inner select, which groups by observation
 * and not by that alias; the outer select aggregates it.
 */
function astMeasureValue(
  eb: ObservationsBuilder,
  metric: AppliedMetricType,
  level: QueryLevel,
): AliasableExpression<unknown> {
  const entry = eventsObservationsMeasure(metric.measureName);
  if ("aggs" in entry) return entry.expression(eb, level);
  if ("relationTable" in entry) {
    // Typed with the scores join, which the query adds for this measure.
    return entry.expression(
      expressionBuilder<ObservationsDb, "e" | "scores">(),
    );
  }
  const value = entry.expression(eb);
  return atLevel(value, level);
}
