import { createQueryId, sql, type KyselyPlugin } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { ClickHouseQueryCompiler } from "./compiler";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { arrayJoin, limitBy, mapKeys, mapValues } from "./extensions";
import {
  ArrayJoinNode,
  LimitByNode,
  isClickHouseSelectQueryNode,
} from "./nodes";
import { TenancyInjectionPlugin } from "./tenancy";

const ctx = { projectId: "proj-1" };

describe("tenancy injection", () => {
  it("requires an ExecutionContext at compile time", () => {
    const qb = getClickhouseKysely()
      .selectFrom("traces")
      .select("environment")
      .where("project_id", "=", "proj-1");

    // The mandatory `ctx` parameter is the primary guard: omitting it is a
    // type error. The `@ts-expect-error` both documents and enforces that
    // contract, and the runtime throw is the defense-in-depth backstop for
    // callers that reach this through an `any` boundary.
    // @ts-expect-error - ctx is required
    expect(() => compileClickhouseQuery(qb)).toThrow(QueryCompileError);
    // @ts-expect-error - ctx is required
    expect(() => compileClickhouseQuery(qb)).toThrow(/no tenancy scope/);
  });

  it("refuses a context with an empty projectId", () => {
    const qb = getClickhouseKysely()
      .selectFrom("traces")
      .select("environment")
      .where("project_id", "=", "proj-1");

    // Type-valid but semantically empty: the type system cannot express
    // "non-empty string", so the runtime check earns its keep here.
    expect(() => compileClickhouseQuery(qb, { projectId: "" })).toThrow(
      /no tenancy scope/,
    );
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

  it("rejects raw SQL fragments in SELECT and WHERE, not only FROM/JOIN", () => {
    const selectRaw = getClickhouseKysely()
      .selectFrom("events_core")
      .select(
        sql<string>`(SELECT environment FROM traces LIMIT 1)`.as("stolen"),
      );

    const whereRaw = getClickhouseKysely()
      .selectFrom("events_core")
      .select("environment")
      .where(sql<boolean>`id IN (SELECT id FROM traces)`);

    expect(() => compileClickhouseQuery(selectRaw, ctx)).toThrow(
      UnscopedRelationError,
    );
    expect(() => compileClickhouseQuery(whereRaw, ctx)).toThrow(
      UnscopedRelationError,
    );
  });

  it("does not treat a copied langfuseTenancy property as a valid stamp", () => {
    const qb = getClickhouseKysely().selectFrom("traces").select("environment");
    const forged = {
      ...qb.toOperationNode(),
      langfuseTenancy: { projectId: "proj-1" },
    };
    const compiler = new ClickHouseQueryCompiler();
    expect(() => compiler.compileQuery(forged, createQueryId())).toThrow(
      QueryCompileError,
    );

    const fakeStamp: KyselyPlugin = {
      transformQuery(args) {
        return {
          ...args.node,
          langfuseTenancy: { projectId: "forged" },
        };
      },
      async transformResult(args) {
        return args.result;
      },
    };
    const stampedByProperty = getClickhouseKysely()
      .withPlugin(fakeStamp)
      .selectFrom("traces")
      .select("environment");
    expect(() => stampedByProperty.compile()).toThrow(QueryCompileError);
  });

  it("qualifies every project_id on a two-table JOIN", () => {
    const qb = getClickhouseKysely()
      .selectFrom("observations as o")
      .innerJoin("traces as t", (join) =>
        join
          .onRef("o.trace_id", "=", "t.id")
          .onRef("o.project_id", "=", "t.project_id"),
      )
      .select("o.environment")
      .where("o.project_id", "=", "proj-1");

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    const refs = compiled.match(/[\w.]*project_id/gi) ?? [];
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const ref of refs) {
      expect(ref).toMatch(/^(o|t)\.project_id$/i);
    }
    expect(compiled).toMatch(/o\.project_id/i);
    expect(compiled).toMatch(/t\.project_id/i);
  });

  it("injects the context project even when the builder scoped a different project", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select("environment")
      .where("project_id", "=", "other-project");

    const { sql: compiled, params } = compileClickhouseQuery(qb, ctx);
    // The builder's `other-project` predicate does not scope the request's
    // project, so the pass must still inject `project_id = proj-1`.
    expect(Object.values(params)).toContain("proj-1");
    const matches = compiled.match(/project_id/gi) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("does not let one unqualified project_id cover multiple tenanted JOIN relations", () => {
    const qb = getClickhouseKysely()
      .selectFrom("observations as o")
      .innerJoin("traces as t", (join) => join.onRef("o.trace_id", "=", "t.id"))
      .select("o.environment")
      // Unqualified, and ambiguous across two tenanted tables — must not be
      // treated as scoping either relation.
      .where("project_id", "=", "proj-1");

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    expect(compiled).toMatch(/o\.project_id/i);
    expect(compiled).toMatch(/t\.project_id/i);
  });

  it("scopes an aliased relation whose alias collides with another table's physical name", () => {
    // `scores AS traces` aliases one tenanted table to the *physical name* of
    // another tenanted table (`traces`). A qualified `traces.project_id`
    // predicate scopes the alias only; the physically-`traces` relation
    // (aliased `t`) must still get its own injected predicate. Regression for
    // an alias/table-name collision that previously left `t` unscoped.
    const qb = getClickhouseKysely()
      .selectFrom("scores as traces")
      .innerJoin("traces as t", (join) => join.onRef("traces.id", "=", "t.id"))
      .select("t.environment")
      .where("traces.project_id", "=", "proj-1");

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    expect(compiled).toMatch(/t\.project_id/i);
    const matches = compiled.match(/project_id/gi) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("ARRAY JOIN and LIMIT BY nodes", () => {
  it("attaches a real ArrayJoinNode, not a RawNode", () => {
    const qb = getClickhouseKysely()
      .selectFrom("observations")
      .select("environment")
      .where("project_id", "=", "proj-1")
      .$call(
        arrayJoin({
          cost_key: mapKeys("cost_details"),
          cost: mapValues("cost_details"),
        }),
      );

    const node = qb
      .withPlugin(new TenancyInjectionPlugin(ctx))
      .toOperationNode();
    expect(isClickHouseSelectQueryNode(node)).toBe(true);
    if (!isClickHouseSelectQueryNode(node)) return;
    expect(node.arrayJoins).toHaveLength(1);
    const arrayJoinNode = node.arrayJoins![0];
    expect(ArrayJoinNode.is(arrayJoinNode)).toBe(true);
    expect(arrayJoinNode.items).toHaveLength(2);
    expect(arrayJoinNode.items[0].expression.kind).toBe("FunctionNode");
    expect(arrayJoinNode.items[0].alias.kind).toBe("IdentifierNode");
    expect(JSON.stringify(node)).not.toMatch(/"kind":"RawNode"/);
  });

  it("emits ARRAY JOIN from the node, not a string splice", () => {
    const qb = getClickhouseKysely()
      .selectFrom("observations")
      .select("environment")
      .where("project_id", "=", "proj-1")
      .$call(arrayJoin({ cost_key: mapKeys("cost_details") }));

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    expect(compiled.toLowerCase()).toContain("array join");
    expect(compiled.toLowerCase()).toContain(
      "mapkeys(cost_details) as cost_key",
    );
  });

  it("attaches a real LimitByNode", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select("span_id")
      .where("project_id", "=", "proj-1")
      .$call(limitBy({ count: 1, columns: ["span_id", "project_id"] }));

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
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select("span_id")
      .where("project_id", "=", "proj-1")
      .limit(50)
      .$call(limitBy({ count: 1, columns: ["span_id"] }));

    const { sql: compiled } = compileClickhouseQuery(qb, ctx);
    const lower = compiled.toLowerCase();
    expect(lower).toContain("limit ");
    expect(lower).toContain(" by ");
    expect(lower.indexOf(" by ")).toBeLessThan(lower.lastIndexOf("limit"));
  });
});
