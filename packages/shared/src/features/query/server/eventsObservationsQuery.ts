/**
 * The v2 observations view's query on the query AST
 * ({@link eventsObservationsAstView}): its FROM, `scores` join, ARRAY JOIN and
 * WHERE, and its dimension and measure selections, read from the entries of
 * `eventsObservationsRegistry.ts`. The steps it shares with the other views
 * run in `defineAstView` (`astViewQuery.ts`).
 */
import { expressionBuilder, type AliasableExpression } from "kysely";
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
import { defineAstView, levelIfAllowed } from "./astViewQuery";
import { type QueryLevel } from "./registryEntry";
import {
  type AppliedDimensionType,
  type AppliedMetricType,
  type TimeWindow,
  atLevel,
  pairExpandDimension,
  dimensionAlias,
} from "./viewQuerySteps";

/** A dashboard filter as the events predicate lowering takes it. */
type DashboardFilter = {
  lowering: EventsFieldLowering;
  condition: PredicateCondition;
};

/**
 * The v2 observations view on the query AST: its entries from
 * `eventsObservationsRegistry.ts`, its filters lowered by the events
 * predicate lowering, one inner row per observation. Reads
 * `events_truncated`, so it selects the `events_core` values as the SQL-text
 * builder (`buildSqlText`) does; a filter that needs untruncated values routes it to
 * `events_full`, where the routing pass cuts the selected truncated columns.
 * Rows flagged deleted are read, as the SQL-text builder does.
 *
 * Plan: the query's one pairExpand dimension, which the source ARRAY JOINs;
 * two throw `InvalidRequestError`.
 */
export const eventsObservationsAstView = defineAstView<
  ObservationsDb,
  "e",
  DashboardFilter,
  AppliedDimensionType | undefined
>({
  serves: [eventsObservationsView],
  numericMetadata: true,
  // No filter joins a relation: `eventsObservationsFilterLowering` compares
  // `e` columns only.
  lowerFilter: (column, filter) => ({
    lowering: eventsObservationsFilterLowering(column),
    condition: conditionFromFilter(filter),
  }),
  plan: (input) => ({
    plan: pairExpandDimension(input.dimensions),
    level: levelIfAllowed(input),
  }),
  source: ({ filters, relations, ctx, plan, window }) =>
    astEventsSource(
      window,
      filters,
      relations.has("scores"),
      ctx.skipScoresFinal,
      plan,
    ),
  dimension: astDimensionSelection,
  measure: astMeasureValue,
  bucket: (eb) => ({
    time: eb.ref("e.start_time"),
    entity: (field) => eventsObservationsDimension(field).expression(eb),
  }),
  perRow: {
    keys: ["e.project_id", "e.span_id"],
    alias: "per_span",
    // An exploded or pair-expanded dimension has one inner row per element.
    extraGroupBy: (dimensions) =>
      dimensions
        .filter((d) => d.explodeArray || d.pairExpand)
        .map((d) => aliasRef(dimensionAlias(d))),
  },
});

/**
 * The FROM, JOINs, ARRAY JOIN and WHERE of the v2 observations query:
 * `from events_truncated as e [inner join scores [final] on …] [array join …] where
 * <filters> and e.start_time between <from> and <to> [and scores.timestamp
 * between <from> and <to>]`.
 */
function astEventsSource(
  { from, to }: TimeWindow,
  filters: DashboardFilter[],
  joinsScores: boolean,
  skipScoresFinal: boolean,
  pairDimension: AppliedDimensionType | undefined,
) {
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
