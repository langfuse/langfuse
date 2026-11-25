import {
  ExpressionWrapper,
  sql,
  type ExpressionBuilder,
  IdentifierNode,
  ValueNode,
  createQueryId,
  expressionBuilder,
} from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery, renderClickhouseExpression } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import {
  cityHash64,
  literal,
  mapContains,
  uniqCombined,
  uniqCombinedIf,
} from "./extensions";
import { FunctionAllowlistPlugin } from "./functions";
import { ParametricAggregateNode, asOperationNode } from "./nodes";
import type { ClickHouseDatabase } from "./schema";

const db = getClickhouseKysely();
type Eb = ExpressionBuilder<ClickHouseDatabase, "traces">;
const check = (query: { toOperationNode(): unknown }) => () =>
  new FunctionAllowlistPlugin().transformQuery({
    node: query.toOperationNode() as never,
    queryId: createQueryId(),
  });

describe("function allowlist", () => {
  // Each reads a table, stalls the server, or leaks server state.
  it.each(["joinGet", "dictGet", "file", "sleep", "currentUser", "getSetting"])(
    "rejects %s",
    (fn) => {
      const query = db
        .selectFrom("traces as t")
        .select((eb) => eb.fn(fn, [eb.ref("t.id")]).as("x"));
      expect(check(query)).toThrow(QueryCompileError);
      expect(check(query)).toThrow(`Function "${fn}" is not on the allowlist`);
    },
  );

  it("rejects an aggregate and a parametric aggregate outside the allowlist", () => {
    const aggregate = db
      .selectFrom("scores as s")
      .select((eb) =>
        eb.fn.agg<number>("groupBitmap", [eb.ref("s.value")]).as("x"),
      );
    expect(check(aggregate)).toThrow('Function "groupBitmap"');

    const parametric = new ExpressionWrapper<
      ClickHouseDatabase,
      "scores",
      number
    >(
      asOperationNode(
        ParametricAggregateNode.create(
          IdentifierNode.create("sequenceMatch"),
          [],
          [ValueNode.createImmediate(1)],
        ),
      ),
    );
    const query = db.selectFrom("scores as s").select([parametric.as("q")]);
    expect(check(query)).toThrow('Function "sequenceMatch"');
  });

  it.each([
    ["eb.ref", (eb: Eb) => eb("traces.id", "in", eb.ref("scores" as never))],
    ["sql.ref", (eb: Eb) => eb("traces.id", "in", sql.ref("scores") as never)],
    [
      "eb.table",
      (eb: Eb) => eb("traces.id", "in", eb.table("scores" as never) as never),
    ],
    [
      "brackets",
      (eb: Eb) =>
        eb("traces.id", "in", eb.parens(eb.ref("scores" as never)) as never),
    ],
  ])(
    "rejects a name on the right of IN (%s), which reads a table",
    (_shape, condition) => {
      const query = db
        .selectFrom("traces")
        .select("id")
        .where((eb) => condition(eb));
      expect(check(query)).toThrow(UnscopedRelationError);
      expect(check(query)).toThrow(
        "Only values or a subquery may sit on the right of IN",
      );
    },
  );

  it("accepts the bounded distinct counts, cityHash64 and mapContains", () => {
    const counts = db
      .selectFrom("events as e")
      .select((eb) => [
        uniqCombined(eb.ref("e.trace_id")).as("traces"),
        uniqCombinedIf(
          eb.ref("e.trace_id"),
          eb("e.level", "=", literal("ERROR")),
        ).as("errored"),
      ])
      .where((eb) => mapContains(eb.ref("e.cost_details"), literal("total")));
    expect(compileClickhouseQuery(counts, "proj-1").sql).toBe(
      "select uniqCombined(e.trace_id) as traces, uniqCombinedIf(e.trace_id, e.level = 'ERROR') as errored" +
        " from events_core as e where e.project_id = {p1:String} and mapContains(e.cost_details, 'total')",
    );

    const sample = db
      .selectFrom("events as e")
      .select("e.trace_id")
      .orderBy((eb) => cityHash64(eb.ref("e.trace_id"), eb.val("seed-1")));
    expect(compileClickhouseQuery(sample, "proj-1").sql).toBe(
      "select e.trace_id from events_core as e where e.project_id = {p1:String}" +
        " order by cityHash64(e.trace_id, {p2:String})",
    );
  });

  it("runs inside compileClickhouseQuery", () => {
    const query = db
      .selectFrom("traces as t")
      .select((eb) => eb.fn("joinGet", [eb.ref("t.id")]).as("x"));
    expect(() => compileClickhouseQuery(query, "proj-1")).toThrow(
      'Function "joinGet" is not on the allowlist',
    );
  });

  it("checks a rendered expression too", () => {
    const eb = expressionBuilder<ClickHouseDatabase, "traces">();
    expect(() =>
      renderClickhouseExpression(eb.fn("joinGet", [eb.ref("traces.id")])),
    ).toThrow('Function "joinGet"');
  });
});
