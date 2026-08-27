import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { mapKeys, mapValues, withArrayJoin, withLimitBy } from "./extensions";
import {
  ArrayJoinNode,
  LimitByNode,
  isClickHouseSelectQueryNode,
} from "./nodes";
import { TenancyInjectionPlugin } from "./tenancy";

const ctx = { projectId: "proj-1" };

describe("tenancy injection", () => {
  it("refuses to compile a query with no ExecutionContext", () => {
    const qb = getClickhouseKysely()
      .selectFrom("traces")
      .select("environment")
      .where("project_id", "=", "proj-1");

    expect(() => compileClickhouseQuery(qb)).toThrow(QueryCompileError);
    expect(() => compileClickhouseQuery(qb)).toThrow(/no tenancy scope/);
  });

  it("refuses kysely.compile() when the tenancy pass did not run", () => {
    const qb = getClickhouseKysely()
      .selectFrom("traces")
      .select("environment")
      .where("project_id", "=", "proj-1");

    expect(() => qb.compile()).toThrow(QueryCompileError);
  });

  it("injects project_id when the builder omitted it", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select("environment");

    const { sql: compiled, params } = compileClickhouseQuery(qb, ctx);
    expect(compiled.toLowerCase()).toContain("project_id");
    expect(Object.values(params)).toContain("proj-1");
  });

  it("does not duplicate project_id when the builder already scoped the table", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select("environment")
      .where("project_id", "=", "proj-1");

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    const matches = compiled.match(/project_id/gi) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("rejects a raw-SQL table source as an unscoped escape hatch", () => {
    const qb = getClickhouseKysely()
      .selectFrom(sql<{ environment: string }>`traces`.as("t"))
      .select("environment");

    expect(() => compileClickhouseQuery(qb, ctx)).toThrow(
      UnscopedRelationError,
    );
  });

  it("rejects aliased raw SQL that would introduce an unscoped relation", () => {
    const qb = getClickhouseKysely()
      .selectFrom(sql<{ environment: string }>`(SELECT * FROM traces)`.as("t"))
      .selectAll();

    expect(() => compileClickhouseQuery(qb, ctx)).toThrow(
      UnscopedRelationError,
    );
  });
});

describe("ARRAY JOIN and LIMIT BY nodes", () => {
  it("attaches a real ArrayJoinNode, not a RawNode", () => {
    const qb = withArrayJoin(
      getClickhouseKysely()
        .selectFrom("observations")
        .select("environment")
        .where("project_id", "=", "proj-1"),
      [
        { expression: mapKeys("cost_details"), as: "cost_key" },
        { expression: mapValues("cost_details"), as: "cost" },
      ],
    );

    const node = qb
      .withPlugin(new TenancyInjectionPlugin(ctx))
      .toOperationNode();
    expect(isClickHouseSelectQueryNode(node)).toBe(true);
    if (!isClickHouseSelectQueryNode(node)) return;
    expect(node.arrayJoins).toHaveLength(1);
    const arrayJoin = node.arrayJoins![0];
    expect(ArrayJoinNode.is(arrayJoin)).toBe(true);
    expect(arrayJoin.items).toHaveLength(2);
    expect(arrayJoin.items[0].expression.kind).toBe("FunctionNode");
    expect(arrayJoin.items[0].alias.kind).toBe("IdentifierNode");
    expect(JSON.stringify(node)).not.toMatch(/"kind":"RawNode"/);
  });

  it("emits ARRAY JOIN from the node, not a string splice", () => {
    const qb = withArrayJoin(
      getClickhouseKysely()
        .selectFrom("observations")
        .select("environment")
        .where("project_id", "=", "proj-1"),
      [{ expression: mapKeys("cost_details"), as: "cost_key" }],
    );

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    expect(compiled.toLowerCase()).toContain("array join");
    expect(compiled.toLowerCase()).toContain(
      "mapkeys(cost_details) as cost_key",
    );
  });

  it("attaches a real LimitByNode", () => {
    const qb = withLimitBy(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .where("project_id", "=", "proj-1"),
      { count: 1, columns: ["span_id", "project_id"] },
    );

    const node = qb
      .withPlugin(new TenancyInjectionPlugin(ctx))
      .toOperationNode();
    expect(isClickHouseSelectQueryNode(node)).toBe(true);
    if (!isClickHouseSelectQueryNode(node)) return;
    expect(node.limitBy).toBeDefined();
    expect(LimitByNode.is(node.limitBy!)).toBe(true);
    expect(node.limitBy!.columns).toHaveLength(2);
    expect(node.limitBy!.count.kind).toBe("ValueNode");
  });

  it("emits LIMIT BY before a plain LIMIT", () => {
    const qb = withLimitBy(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .where("project_id", "=", "proj-1")
        .limit(50),
      { count: 1, columns: ["span_id"] },
    );

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    const lower = compiled.toLowerCase();
    expect(lower).toContain("limit ");
    expect(lower).toContain(" by ");
    expect(lower.indexOf(" by ")).toBeLessThan(lower.lastIndexOf("limit"));
  });
});
