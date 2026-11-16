import {
  ExpressionWrapper,
  OrderByItemNode,
  sql,
  type RawBuilder,
} from "kysely";
import { describe, expect, it } from "vitest";

import {
  compileClickhouseCondition,
  compileClickhouseQuery,
  renderClickhouseExpression,
  renderClickhouseSelections,
} from "./compile";
import { getClickhouseKysely } from "./dialect";
import { UnscopedRelationError } from "./errors";
import { literal } from "./extensions";

const db = getClickhouseKysely();
const compile = (expression: RawBuilder<unknown>) => () =>
  compileClickhouseQuery(
    db.selectFrom("traces as t").select(expression.as("x")),
    "proj-A",
  );

describe("raw SQL", () => {
  it.each<[string, RawBuilder<unknown>]>([
    ["a sql template", sql`t.id in scores`],
    ["sql.raw", sql.raw("t.id")],
    ["sql.lit", sql.lit("a")],
    ["sql.val", sql.val("a")],
    ["sql.id", sql.id("t", "id")],
    ["sql.table", sql.table("scores")],
    ["sql.join", sql.join([sql.ref("t.id"), sql.ref("t.name")])],
    ["text around one reference", sql`${db.dynamic.ref("t.id")} or 1 = 1`],
    ["one expression that is no reference", sql`${literal(1)}`],
    ["a direction outside ORDER BY", sql`desc`],
  ])("rejects %s", (_shape, expression) => {
    expect(compile(expression)).toThrow(UnscopedRelationError);
  });

  it.each([
    [
      "modifyEnd",
      db.selectFrom("traces").select("id").modifyEnd(sql.ref("id")),
    ],
    [
      "modifyFront",
      db.selectFrom("traces").select("id").modifyFront(sql.ref("id")),
    ],
  ])("rejects %s, which writes outside the select", (_name, query) => {
    expect(() => compileClickhouseQuery(query, "proj-A")).toThrow(
      "modifyFront/modifyEnd are rejected",
    );
  });

  it.each([
    [
      "a CTE body",
      db
        .with("blob_storage_file_log", () =>
          sql.ref<{ project_id: string }>("x"),
        )
        .selectFrom("blob_storage_file_log")
        .select("project_id"),
    ],
    [
      "a UNION operand",
      db
        .selectFrom("traces as t")
        .select("t.id")
        .union(sql.ref<{ id: string }>("blob_storage_file_log")),
    ],
  ])("rejects sql.ref as %s, which names a table unscoped", (_slot, query) => {
    expect(() => compileClickhouseQuery(query, "proj-A")).toThrow(
      "is not a select query",
    );
  });

  it.each([
    ["text after the keyword", sql`desc, (select 1 from scores)`],
    ["a value after the keyword", sql`desc${sql.ref("t.environment")}`],
  ])("rejects %s as an ORDER BY direction", (_shape, direction) => {
    const query = db
      .selectFrom("traces as t")
      .select("t.id")
      .orderBy(
        new ExpressionWrapper(
          OrderByItemNode.create(
            sql.ref("t.id").toOperationNode(),
            direction.toOperationNode(),
          ),
        ),
      );
    expect(() => compileClickhouseQuery(query, "proj-A")).toThrow(
      UnscopedRelationError,
    );
  });

  it.each<[string, () => unknown]>([
    [
      "compileClickhouseCondition",
      () =>
        compileClickhouseCondition(
          db.selectFrom("traces as t").where(sql<boolean>`1 = 1`),
          "proj-A",
          "f_",
        ),
    ],
    ["renderClickhouseExpression", () => renderClickhouseExpression(sql`1`)],
    [
      "renderClickhouseSelections",
      () =>
        renderClickhouseSelections(
          db.selectFrom("traces as t").select(sql<number>`1`.as("x")),
        ),
    ],
  ])("rejects raw SQL in %s", (_entry, render) => {
    expect(render).toThrow(UnscopedRelationError);
  });

  it("compiles sql.ref and ORDER BY directions", () => {
    const query = db
      .selectFrom("traces as t")
      .select(sql.ref<string>("t.id").as("x"))
      .where(sql.ref<string>("t.environment"), "=", "a")
      .orderBy("t.id", "desc")
      .orderBy("t.environment", "asc");
    expect(compileClickhouseQuery(query, "proj-A").sql).toBe(
      "select t.id as x from traces as t where t.project_id = {p1:String} and t.environment = {p2:String} order by t.id desc, t.environment asc",
    );
  });
});

describe("inlined text", () => {
  it.each([
    [
      "a JSON reference",
      db
        .selectFrom("observations as o")
        .select((eb) => eb.ref("o.cost_details", "->>$").key("a").as("k")),
    ],
    [
      "a JSON path",
      db
        .selectFrom("observations as o")
        .select((eb) => eb.jsonPath<"o.cost_details">().key("a").as("k")),
    ],
  ])("rejects %s, whose keys are inlined into a string", (_shape, query) => {
    expect(() => compileClickhouseQuery(query, "proj-A")).toThrow(
      "are not supported",
    );
  });

  it("spaces unary minus from a negative operand, so it writes no comment", () => {
    const query = db
      .selectFrom("traces as t")
      .select((eb) => [eb.neg(eb.lit(-1)).as("a"), "t.id"])
      .where((eb) =>
        eb("t.id", "=", literal("\nproject_id, id from scores --")),
      );
    expect(compileClickhouseQuery(query, "proj-A").sql).toBe(
      "select - -1 as a, t.id from traces as t where t.project_id = {p1:String} and t.id = '\nproject_id, id from scores --'",
    );
  });
});
