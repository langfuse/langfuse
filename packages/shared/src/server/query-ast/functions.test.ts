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
    ["sql.id", (eb: Eb) => eb("traces.id", "in", sql.id("scores") as never)],
    ["sql.raw", (eb: Eb) => eb("traces.id", "in", sql.raw("scores") as never)],
    [
      "eb.table",
      (eb: Eb) => eb("traces.id", "in", eb.table("scores" as never) as never),
    ],
    [
      "a backtick-quoted raw name",
      (eb: Eb) => eb("traces.id", "in", sql.raw("`scores`") as never),
    ],
    [
      "a double-quoted raw name",
      (eb: Eb) => eb("traces.id", "in", sql.raw('"scores"') as never),
    ],
    [
      "brackets",
      (eb: Eb) =>
        eb("traces.id", "in", eb.parens(eb.ref("scores" as never)) as never),
    ],
    [
      "a raw operator",
      (eb: Eb) =>
        eb("traces.id", sql`not in` as never, sql.ref("scores") as never),
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
