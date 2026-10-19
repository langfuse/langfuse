import { expressionBuilder, type ExpressionBuilder } from "kysely";

import { getClickhouseKysely } from "../query-ast/dialect";
import { ifNull, literal } from "../query-ast/extensions";
import type { ClickHouseDatabase } from "../query-ast/schema";
import {
  eventsMetricsSecondsSelects,
  eventsTraceName,
  scopedToEvents,
  traceAggregationSelects,
} from "./events-selects";

/**
 * Compile-time assertions that the shared events expressions keep their table
 * scope: they type-check only in a query that reads a full events row as `e`
 * and nothing else. Never called at runtime; `tsc` is the test, and every
 * `@ts-expect-error` must stay a real error. `events.test.ts` anchors it.
 */
export function eventsSelectsScopeTypeAssertions(): void {
  const db = getClickhouseKysely();

  db.selectFrom("events_core as e").select(traceAggregationSelects);
  db.selectFrom("events_full as e").select(traceAggregationSelects);
  db.selectFrom("events as e").select(traceAggregationSelects);

  db.selectFrom("events as e")
    .innerJoin("traces as t", "t.id", "e.trace_id")
    // @ts-expect-error a join
    .select(traceAggregationSelects);

  db.with("e", (qb) => qb.selectFrom("events_core").selectAll())
    .selectFrom("traces as t")
    // @ts-expect-error a CTE named `e` is not read in FROM
    .select(traceAggregationSelects);

  db.selectFrom("traces as t")
    // @ts-expect-error no `e` in scope
    .select(traceAggregationSelects);

  db.selectFrom("events_core")
    // @ts-expect-error the events table is not aliased `e`
    .select(traceAggregationSelects);

  db.selectFrom("traces as t")
    .selectAll()
    // @ts-expect-error no `e` in scope
    .where((eb) => eb(eventsTraceName(eb), "is not", null));

  db.selectFrom("observations as e")
    .selectAll()
    // @ts-expect-error `e` lacks events columns (`trace_name`, `is_app_root`)
    .where((eb) => eb(eventsTraceName(eb), "is not", null));

  db.selectFrom(
    db.selectFrom("events as x").select(["x.start_time", "x.end_time"]).as("e"),
  )
    // @ts-expect-error the subquery `e` lacks `completion_start_time`
    .select(eventsMetricsSecondsSelects);

  db.with("e", (qb) => qb.selectFrom("events_core").selectAll())
    // @ts-expect-error no FROM: `e` is never read
    .selectNoFrom((eb) => [eventsTraceName(eb).as("name")]);

  // A helper that composes the exports keeps the check through scopedToEvents.
  const traceNameSelect = scopedToEvents((eb) =>
    eventsTraceName(eb).as("name"),
  );
  db.selectFrom("events_core as e").select(traceNameSelect);
  db.selectFrom("events_core as e")
    .innerJoin("traces as t", "t.id", "e.trace_id")
    // @ts-expect-error a join, through a composed helper
    .select(traceNameSelect);
  db.selectFrom("observations as e")
    // @ts-expect-error `e` lacks events columns, through a composed helper
    .select(traceNameSelect);

  // Intentionally valid at the TS layer: a helper result does not carry the
  // scope of the builder it was made from, and Kysely's `select()` accepts any
  // aliased expression. Build shared expressions from the query's builder.
  const detached = expressionBuilder<
    { e: ClickHouseDatabase["events_core"] },
    "e"
  >();
  db.selectFrom("traces as t").select(
    ifNull(detached.ref("e.trace_name"), literal("")).as("name"),
  );

  // Intentionally valid too: upcasting the query's builder to the plain events
  // builder (here, under a join) drops what the guard checks. Use
  // scopedToEvents instead of typing a parameter as `ExpressionBuilder`.
  db.selectFrom("events_core as e")
    .innerJoin("traces as t", "t.id", "e.trace_id")
    .select((eb) => {
      const events: ExpressionBuilder<
        { e: ClickHouseDatabase["events_core"] },
        "e"
      > = eb;
      return [eventsTraceName(events).as("name")];
    });
}
