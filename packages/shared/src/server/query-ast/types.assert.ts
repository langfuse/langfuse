import { type InferResult } from "kysely";

import { getClickhouseKysely } from "./dialect";
import { arrayJoin, limitBy, mapKeys, mapValues, useFinal } from "./extensions";
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

  db.selectFrom("events")
    .select("environment")
    // @ts-expect-error DateTime column compared to Int
    .where("start_time", "=", 123);

  db.selectFrom("events")
    .select("environment")
    .where("start_time", ">=", new Date("2026-01-01T00:00:00.000Z"));

  db.selectFrom("events").select((eb) => eb.fn.sum("total_cost").as("s"));

  // Intentionally valid at the TS layer — Kysely does not constrain sum()
  // to numeric columns. The runtime pass in typecheck.ts rejects this.
  db.selectFrom("events").select((eb) => eb.fn.sum("environment").as("s"));

  db.selectFrom("events")
    // @ts-expect-error unknown column is not in the schema
    .select("not_a_column");

  // @ts-expect-error physical events tables are reached through `events` / `events_truncated`
  db.selectFrom("events_core");
  // @ts-expect-error physical events tables are reached through `events` / `events_truncated`
  db.selectFrom("events_full as e");

  const view = defineView("environments_view")<{ environment: string }>(() =>
    db.selectFrom("events").select("environment").distinct(),
  );
  fromView(view).select("environment");
  fromView(view)
    // @ts-expect-error view is a black box: inner columns are not exposed
    .select("span_id");

  // Named-tuple arrays read as arrays of objects keyed by tuple name; a typo
  // in the column type would make the row field `never` and reject these.
  const _skills = db
    .selectFrom("events")
    .select(["skills_available", "skills_resource_loaded"]);
  type SkillsRow = InferResult<typeof _skills>[number];
  const _available: SkillsRow["skills_available"] = [
    { langfuseSkillId: null, skillVersion: null, skillName: "s" },
    { langfuseSkillId: "id", skillVersion: 1, skillName: "s" },
  ];
  const _loaded: SkillsRow["skills_resource_loaded"] = [
    {
      langfuseSkillId: null,
      skillVersion: null,
      skillName: "s",
      filePath: "f",
    },
  ];
  // @ts-expect-error skills_available elements have no filePath
  type _NoFilePath = SkillsRow["skills_available"][number]["filePath"];
}

/**
 * Compile-time assertions that the `$call` extension helpers infer correctly:
 * `arrayJoin` widens the output row type with each declared alias, and `limitBy`
 * / `useFinal` preserve it. `tsc` is the test.
 */
export function extensionTypeAssertions(): void {
  const db = getClickhouseKysely();

  const _widened = db
    .selectFrom("observations")
    .select("environment")
    .$call(
      arrayJoin((eb) => ({
        cost_key: mapKeys(eb.ref("cost_details")),
        cost: mapValues(eb.ref("cost_details")),
      })),
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
    .selectFrom("events")
    .select("span_id")
    .$call(limitBy({ count: 1, columns: (eb) => [eb.ref("span_id")] }));
  type Limited = InferResult<typeof _limited>[number];
  type _Span = Limited["span_id"];
  // @ts-expect-error limitBy adds no columns
  type _NoExtra = Limited["cost_key"];

  // Helper columns are references checked against the query's tables.
  db.selectFrom("events as e")
    .select("e.span_id")
    // @ts-expect-error eb.ref resolves against this select's tables
    .$call(limitBy({ count: 1, columns: (eb) => [eb.ref("e.span_idx")] }));
  db.selectFrom("observations")
    .select("environment")
    // @ts-expect-error eb.ref resolves against this select's tables
    .$call(arrayJoin((eb) => ({ k: mapKeys(eb.ref("cost_detailz")) })));
  db.selectFrom("observations").select((eb) =>
    // @ts-expect-error mapKeys takes a Map column, not a String column
    mapKeys(eb.ref("environment")).as("k"),
  );

  // useFinal preserves the row type: it declares no new columns.
  const _final = db
    .selectFrom("scores as s")
    .select("s.id")
    .$call(useFinal(["scores"]));
  type FinalRow = InferResult<typeof _final>[number];
  type _Id = FinalRow["id"];
  // @ts-expect-error useFinal adds no columns
  type _NoFinalExtra = FinalRow["cost_key"];
}
