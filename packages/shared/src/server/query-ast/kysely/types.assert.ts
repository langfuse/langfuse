import { getClickhouseKysely } from "./dialect";
import { defineView, fromView } from "./views";

/**
 * Compile-time assertions for condition 7 / 8. Never called at runtime;
 * `tsc` is the test. `@ts-expect-error` must stay unused-error-free.
 *
 * Which layer catches what:
 * - DateTime vs Int comparison: TS types (Kysely OperandValueExpression)
 * - unknown column name: TS types
 * - view exposing only declared columns: TS types
 * - sum() over a String column: NOT caught by TS (Kysely's sum() argument
 *   is any ReferenceExpression) — caught by the runtime validation pass
 * - column-name auto-complete: yes, from ClickHouseDatabase schema keys
 */
export function condition7TypeAssertions(): void {
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
