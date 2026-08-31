import { type InferResult } from "kysely";

import { getClickhouseKysely } from "./dialect";
import { arrayJoin, limitBy, mapKeys, mapValues } from "./extensions";
import { defineView, fromView } from "./views";

/**
 * Compile-time assertions that the typed schema and virtual views enforce their
 * guarantees at the type layer. Never called at runtime; `tsc` is the test, and
 * every `@ts-expect-error` must stay a real (unused-error-free) error.
 *
 * Which layer catches what:
 * - DateTime vs Int comparison: TS types (Kysely OperandValueExpression)
 * - unknown column name: TS types
 * - view exposing only declared columns: TS types
 * - sum() over a String column: NOT caught by TS (Kysely's sum() argument
 *   is any ReferenceExpression) — caught by the runtime validation pass
 * - column-name auto-complete: yes, from ClickHouseDatabase schema keys
 */
export function schemaTypeAssertions(): void {
  const db = getClickhouseKysely();

  db.selectFrom("events_core")
    .select("environment")
    // @ts-expect-error DateTime column compared to Int
    .where("start_time", "=", 123);

  db.selectFrom("events_core")
    .select("environment")
    .where("start_time", ">=", new Date("2026-01-01T00:00:00.000Z"));

  db.selectFrom("events_core").select((eb) => eb.fn.sum("total_cost").as("s"));

  // Intentionally valid at the TS layer — Kysely does not constrain sum()
  // to numeric columns. The runtime pass in typecheck.ts rejects this.
  db.selectFrom("events_core").select((eb) => eb.fn.sum("environment").as("s"));

  db.selectFrom("events_core")
    // @ts-expect-error unknown column is not in the schema
    .select("not_a_column");

  const view = defineView("environments_view")<{ environment: string }>(() =>
    db.selectFrom("events_core").select("environment").distinct(),
  );
  fromView(view).select("environment");
  fromView(view)
    // @ts-expect-error view is a black box: inner columns are not exposed
    .select("span_id");
}

/**
 * Compile-time assertions that the `$call` extension helpers infer correctly:
 * `arrayJoin` widens the output row type with each declared alias, and `limitBy`
 * preserves it. `tsc` is the test.
 */
export function extensionTypeAssertions(): void {
  const db = getClickhouseKysely();

  const _widened = db
    .selectFrom("observations")
    .select("environment")
    .$call(
      arrayJoin({
        cost_key: mapKeys("cost_details"),
        cost: mapValues("cost_details"),
      }),
    );
  type Widened = InferResult<typeof _widened>[number];
  // Each arrayJoin alias is added to the output row, so it is referenceable
  // downstream (e.g. an outer query over a CTE body) and a typo on the alias
  // name is a compile error (indexing an absent key fails). The element value
  // type is opaque — Kysely's Expression hides its type arg from inference —
  // so it surfaces as unknown.
  type _Key = Widened["cost_key"];
  type _Cost = Widened["cost"];
  // @ts-expect-error an alias the arrayJoin did not declare is absent
  type _Missing = Widened["not_joined"];

  // limitBy preserves the row type: it declares no new columns.
  const _limited = db
    .selectFrom("events_core")
    .select("span_id")
    .$call(limitBy({ count: 1, columns: ["span_id"] }));
  type Limited = InferResult<typeof _limited>[number];
  type _Span = Limited["span_id"];
  // @ts-expect-error limitBy adds no columns
  type _NoExtra = Limited["cost_key"];
}
