import {
  ExpressionWrapper,
  IdentifierNode,
  ValueNode,
  createQueryId,
  expressionBuilder,
} from "kysely";
import { describe, expect, it } from "vitest";

import { renderClickhouseExpression } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { FunctionAllowlistPlugin } from "./functions";
import { ParametricAggregateNode, asOperationNode } from "./nodes";
import type { ClickHouseDatabase } from "./schema";

const db = getClickhouseKysely();
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

  it("rejects a column reference on the right of IN, which reads a table", () => {
    const query = db
      .selectFrom("traces as t")
      .select("t.id")
      .where((eb) => eb("t.id", "in", eb.ref("scores" as never)));
    expect(check(query)).toThrow(UnscopedRelationError);
    expect(check(query)).toThrow("A column reference on the right of IN");
  });

  it("checks a rendered expression too", () => {
    const eb = expressionBuilder<ClickHouseDatabase, "traces">();
    expect(() =>
      renderClickhouseExpression(eb.fn("joinGet", [eb.ref("traces.id")])),
    ).toThrow('Function "joinGet"');
  });
});
