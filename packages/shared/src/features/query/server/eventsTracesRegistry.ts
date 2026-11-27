/**
 * The v2 traces view (`eventsTracesView` in `dataModel.ts`) as query-AST
 * expressions: every dimension and measure, keyed by the view's names, how a
 * dashboard filter compares each dimension, and the `scores` join condition.
 * The root-event condition is the query's (`eventsTracesQuery.ts`).
 * Server-only; names, labels and the other view metadata stay in
 * `dataModel.ts`, which the client imports. Each entry renders the same SQL
 * as the view's strings (`eventsTracesRegistry.golden.test.ts`), up to the
 * relation alias.
 *
 * The view has one row per trace, aggregated from its events: entries read
 * the events relation as `e`, so they share the `e`-scoped expressions of
 * `events-selects.ts`; the legacy strings call it `events_traces`. Entries
 * pick no table: the query reads the logical `events`, and routing picks
 * `events_core` or `events_full` from its filters.
 */
import type { AliasableExpression, ExpressionBuilder } from "kysely";
import type { z } from "zod";

import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import {
  argMaxIf,
  arrayDistinct,
  dateDiff,
  flatten,
  formatDateTime,
  groupArray,
  latestNonEmpty,
  literal,
  mapValue,
  maxIf,
  minIf,
  nullIfEmpty,
  sumIf,
  sumMapIf,
  toNullable,
  uniq,
  uniqIf,
} from "../../../server/query-ast/extensions";
import type { ClickHouseDatabase } from "../../../server/query-ast/schema";
import type {
  EventsFieldLowering,
  ScalarFieldLowering,
} from "../../../server/repositories/events-predicate-fields";
import {
  eventsTraceName,
  eventsTraceNameAggregate,
} from "../../../server/repositories/events-selects";
import { eventsTracesView } from "../dataModel";
import type { metricAggregations } from "../types";
import {
  entryOf,
  scalarDimensions,
  type Read as EntryRead,
  type ScalarDimensionEntry,
} from "./registryEntry";
import { filterDimensionName } from "./viewQuerySteps";

/** The relations a v2 traces query reads: events as `e`, and `scores`. */
export type TracesDb = {
  e: ClickHouseDatabase["events"];
  scores: ClickHouseDatabase["scores"];
};

/** Builder of a query that reads the view's events as `e`. */
export type TracesBuilder = ExpressionBuilder<TracesDb, "e">;

/** {@link TracesBuilder} with the `scores` relation joined. */
type TracesWithScoresBuilder = ExpressionBuilder<TracesDb, "e" | "scores">;

/** A value over `e`: a row value, or a per-trace aggregate. */
type Read<T> = EntryRead<T, TracesBuilder>;

/**
 * A dimension of the view:
 * - `expression`: its value on one event row, at single level and as an
 *   entity bucket;
 * - `perTrace`: its value in the inner select of a two-level query, one row
 *   per trace; `any(<expression>)` when absent (only `id`, the group key);
 * - `filter`: what a dashboard filter compares, on each event row;
 * - `prunedBy`: columns a filter also compares, ORed, ahead of `filter`, so
 *   their skip indexes prune (`name`: the trace name is an expression no
 *   index covers).
 */
type DimensionEntry = Omit<ScalarDimensionEntry<TracesBuilder>, "filter"> & {
  filter: ScalarFieldLowering<TracesBuilder>;
  perTrace?: Read<unknown>;
  prunedBy?: readonly ScalarFieldLowering<TracesBuilder>[];
};

const { stringDimension, nullIfEmptyDimension, nullableStringDimension } =
  scalarDimensions<TracesBuilder>();

/**
 * A string dimension where '' means unset; per trace, the latest non-empty
 * value among its events.
 */
const latestNonEmptyDimension = (
  column: Read<string>,
  facts: { ngramIndexed?: true } = {},
): DimensionEntry => ({
  ...nullIfEmptyDimension(column, facts),
  perTrace: (eb) => latestNonEmpty(column(eb), eb.ref("e.event_ts")),
});

/** The event is an observation, not the trace root. */
const hasParent = (eb: TracesBuilder) =>
  eb("e.parent_span_id", "!=", literal(""));

/**
 * Dimensions of the v2 traces view, keyed by name, in view order.
 * @internal
 */
export const EVENTS_TRACES_DIMENSIONS = {
  id: stringDimension((eb) => eb.ref("e.trace_id")),
  name: {
    ...nullableStringDimension((eb) => eventsTraceName(eb)),
    perTrace: (eb) => eventsTraceNameAggregate(eb),
    prunedBy: [
      { kind: "string", value: (eb) => eb.ref("e.trace_name") },
      { kind: "string", value: (eb) => eb.ref("e.name"), ngramIndexed: true },
    ],
  },
  tags: {
    expression: (eb) => eb.ref("e.tags"),
    perTrace: (eb) => arrayDistinct(flatten(groupArray(eb.ref("e.tags")))),
    filter: { kind: "array", value: (eb) => eb.ref("e.tags") },
  },
  userId: latestNonEmptyDimension((eb) => eb.ref("e.user_id"), {
    ngramIndexed: true,
  }),
  sessionId: latestNonEmptyDimension((eb) => eb.ref("e.session_id"), {
    ngramIndexed: true,
  }),
  release: latestNonEmptyDimension((eb) => eb.ref("e.release")),
  version: latestNonEmptyDimension((eb) => eb.ref("e.version")),
  environment: latestNonEmptyDimension((eb) => eb.ref("e.environment")),
  // A filter compares the event's `YYYY-MM` month with its value. No query
  // selects the row value: the view declares a per-trace aggregation, which
  // rules out single level and the entity bucket.
  timestampMonth: {
    ...stringDimension((eb) =>
      formatDateTime(eb.ref("e.start_time"), literal("%Y-%m")),
    ),
    perTrace: (eb) =>
      formatDateTime(eb.fn.min(eb.ref("e.start_time")), literal("%Y-%m")),
  },
} satisfies Record<string, DimensionEntry>;

/** {@link EVENTS_TRACES_DIMENSIONS} keyed by any string. */
const DIMENSIONS_BY_NAME: Readonly<Record<string, DimensionEntry>> =
  EVENTS_TRACES_DIMENSIONS;

/** The dimension `name`; the caller has checked the view declares it. */
export const eventsTracesDimension = (name: string): DimensionEntry =>
  entryOf(DIMENSIONS_BY_NAME, name, "Dimension", "EVENTS_TRACES_DIMENSIONS");

/**
 * What a dashboard filter compares: `filter`, and for `name` the `prunedBy`
 * columns ({@link DimensionEntry}).
 */
type TracesFilterLowering = {
  filter: EventsFieldLowering;
  prunedBy?: readonly ScalarFieldLowering<TracesBuilder>[];
};

/**
 * What a dashboard filter on `column` compares: the time dimension
 * `start_time`, the keyed `metadata`, or a dimension's
 * {@link DimensionEntry.filter} and `prunedBy`; `name`'s for another `…Name`
 * column (`filterDimensionName`), so a score filter sent to this view keeps
 * working.
 *
 * Throws `InvalidRequestError` for any other column.
 */
export function eventsTracesFilterLowering(
  column: string,
): TracesFilterLowering {
  if (column === "start_time") {
    return {
      filter: { kind: "scalar", value: (eb) => eb.ref("e.start_time") },
    };
  }
  if (column === "metadata") return { filter: { kind: "metadata" } };
  const name = filterDimensionName(column, EVENTS_TRACES_DIMENSIONS);
  if (name === undefined) {
    throw new InvalidRequestError(
      `Invalid filter column ${column}. Must be one of ${Object.keys(eventsTracesView.dimensions)} or ${eventsTracesView.timeDimension}`,
    );
  }
  const { filter, prunedBy } = eventsTracesDimension(name);
  return { filter, prunedBy };
}

/** A query metric's aggregation (`sum`, `count`, `p95`, …), the key of an override. */
type Aggregation = z.infer<typeof metricAggregations>;

/**
 * A measure of the view. Each is already an aggregate over a trace's events,
 * so it is read as it is in the inner select of a two-level query (every
 * query with a measure has two levels):
 * - event measure: reads `e`; `aggregationOverrides` replaces it for the
 *   aggregations the view overrides (`dataModel.ts`);
 * - relation measure: reads the joined `scores` relation, so its builder has
 *   `scores` in scope. Only `scoresCount` has it.
 *
 * Consumers tell them apart with `"relationTable" in entry`.
 */
export type MeasureEntry =
  | {
      expression: Read<unknown>;
      aggregationOverrides?: Partial<Record<Aggregation, Read<unknown>>>;
    }
  | {
      /** The view relation the query joins when it selects this measure. */
      relationTable: "scores";
      expression: (eb: TracesWithScoresBuilder) => AliasableExpression<unknown>;
    };

/** A measure over `e` without aggregation overrides. */
const eventMeasure = (expression: Read<unknown>): MeasureEntry => ({
  expression,
});

/**
 * The trace's latest non-empty `column`, NULL when no event set it, so a
 * `count` or `uniq` aggregation counts one value per trace.
 */
const latestNonEmptyOrNull = (eb: TracesBuilder, column: Read<string>) =>
  argMaxIf(
    nullIfEmpty(column(eb)),
    eb.ref("e.event_ts"),
    eb(column(eb), "!=", literal("")),
  );

/**
 * The number of distinct non-empty values of `column`; for a `count` or
 * `uniq` aggregation, one value per trace ({@link latestNonEmptyOrNull}).
 */
const distinctValues = (column: Read<string>): MeasureEntry => ({
  expression: (eb: TracesBuilder) => uniq(nullIfEmpty(column(eb))),
  aggregationOverrides: {
    count: (eb) => latestNonEmptyOrNull(eb, column),
    uniq: (eb) => latestNonEmptyOrNull(eb, column),
  },
});

/**
 * Measures of the v2 traces view, keyed by name, in view order. The
 * observation measures read the trace's non-root events (`hasParent`).
 * @internal
 */
export const EVENTS_TRACES_MEASURES = {
  count: eventMeasure((eb) => uniq(eb.ref("e.trace_id"))),
  observationsCount: eventMeasure((eb) =>
    uniqIf(eb.ref("e.span_id"), hasParent(eb)),
  ),
  scoresCount: {
    relationTable: "scores",
    expression: (eb: TracesWithScoresBuilder) => uniq(eb.ref("scores.id")),
  },
  uniqueUserIds: distinctValues((eb) => eb.ref("e.user_id")),
  uniqueSessionIds: distinctValues((eb) => eb.ref("e.session_id")),
  latency: eventMeasure((eb) =>
    dateDiff(
      "millisecond",
      minIf(eb.ref("e.start_time"), hasParent(eb)),
      maxIf(eb.ref("e.end_time"), hasParent(eb)),
    ),
  ),
  totalTokens: eventMeasure((eb) =>
    mapValue(
      sumMapIf(eb.ref("e.usage_details"), hasParent(eb)),
      literal("total"),
    ),
  ),
  totalCost: eventMeasure((eb) =>
    sumIf(toNullable(eb.ref("e.total_cost")), hasParent(eb)),
  ),
} satisfies Record<string, MeasureEntry>;

/** {@link EVENTS_TRACES_MEASURES} keyed by any string. */
const MEASURES_BY_NAME: Readonly<Record<string, MeasureEntry>> =
  EVENTS_TRACES_MEASURES;

/**
 * The measure `name` as `aggregation` reads it: its override for that
 * aggregation, else the measure. The caller has checked the view declares it.
 */
export function eventsTracesMeasure(
  name: string,
  aggregation: Aggregation,
): MeasureEntry {
  const entry = entryOf(
    MEASURES_BY_NAME,
    name,
    "Measure",
    "EVENTS_TRACES_MEASURES",
  );
  if ("relationTable" in entry) return entry;
  const override = entry.aggregationOverrides?.[aggregation];
  return override ? { expression: override } : entry;
}

/**
 * Join condition of the view's `scores` relation. `liveScoresOnly` also drops
 * score tombstones (`scores.is_deleted = 0`), for a join without `FINAL`, as
 * `eventsObservationsScoresJoin` does.
 */
export const eventsTracesScoresJoin = (
  eb: TracesWithScoresBuilder,
  { liveScoresOnly = false }: { liveScoresOnly?: boolean } = {},
) =>
  eb.and([
    eb("e.trace_id", "=", eb.ref("scores.trace_id")),
    eb("e.project_id", "=", eb.ref("scores.project_id")),
    ...(liveScoresOnly ? [eb("scores.is_deleted", "=", literal(0))] : []),
  ]);
