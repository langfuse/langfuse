import { createQueryId, sql, type KyselyPlugin } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { ClickHouseQueryCompiler } from "./compiler";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { arrayJoin, limitBy, mapKeys, mapValues, useFinal } from "./extensions";
import {
  ArrayJoinNode,
  FinalTableNode,
  LimitByNode,
  isClickHouseSelectQueryNode,
} from "./nodes";
import { TenancyInjectionPlugin } from "./tenancy";

const projectId = "proj-1";

describe("tenancy injection", () => {
  it("requires a projectId at compile time", () => {
    const qb = getClickhouseKysely()
      .selectFrom("traces")
      .select("environment")
      .where("project_id", "=", "proj-1");

    // The mandatory `projectId` parameter is the primary guard: omitting it is
    // a type error. The `@ts-expect-error` both documents and enforces that
    // contract, and the runtime throw is the defense-in-depth backstop for
    // callers that reach this through an `any` boundary.
    // @ts-expect-error - projectId is required
    expect(() => compileClickhouseQuery(qb)).toThrow(QueryCompileError);
    // @ts-expect-error - projectId is required
    expect(() => compileClickhouseQuery(qb)).toThrow(/no tenancy scope/);
  });

  it("refuses an empty projectId", () => {
    const qb = getClickhouseKysely()
      .selectFrom("traces")
      .select("environment")
      .where("project_id", "=", "proj-1");

    // Type-valid but semantically empty: the type system cannot express
    // "non-empty string", so the runtime check earns its keep here.
    expect(() => compileClickhouseQuery(qb, "")).toThrow(/no tenancy scope/);
  });

  it("refuses a scope that is not a single projectId string", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select("environment");

    expect(() =>
      // @ts-expect-error - a query is scoped to exactly one project
      compileClickhouseQuery(qb, ["proj-a", "proj-b"]),
    ).toThrow(/no tenancy scope/);
    expect(() =>
      // @ts-expect-error - the scope is the projectId itself, not a context
      compileClickhouseQuery(qb, { projectId: "proj-a" }),
    ).toThrow(/no tenancy scope/);
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

    const { sql: compiled, params } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toContain("project_id");
    expect(Object.values(params)).toContain("proj-1");
  });

  it("does not duplicate project_id when the builder already scoped the table", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events_core")
      .select("environment")
      .where("project_id", "=", "proj-1");

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    const matches = compiled.match(/project_id/gi) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("rejects a raw-SQL table source as an unscoped escape hatch", () => {
    const qb = getClickhouseKysely()
      .selectFrom(sql<{ environment: string }>`traces`.as("t"))
      .select("environment");

    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      UnscopedRelationError,
    );
  });

  it("rejects aliased raw SQL that would introduce an unscoped relation", () => {
    const qb = getClickhouseKysely()
      .selectFrom(sql<{ environment: string }>`(SELECT * FROM traces)`.as("t"))
      .selectAll();

    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      UnscopedRelationError,
    );
  });

  it.each(["remote", "clusterAllReplicas", "merge"])(
    "rejects the %s table function as a FROM source",
    (fn) => {
      const qb = getClickhouseKysely()
        .selectFrom((eb) =>
          eb
            .fn<{
              environment: string;
            }>(fn, [eb.val("default"), eb.val("traces")])
            .as("t"),
        )
        .select("t.environment");

      expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
        UnscopedRelationError,
      );
    },
  );

  it.each(["remote", "clusterAllReplicas", "merge"])(
    "rejects the %s table function as a JOIN source",
    (fn) => {
      const qb = getClickhouseKysely()
        .selectFrom("events_core as e")
        .innerJoin(
          (eb) =>
            eb
              .fn<{ id: string }>(fn, [eb.val("default"), eb.val("traces")])
              .as("t"),
          (join) => join.onRef("e.trace_id", "=", "t.id"),
        )
        .select("t.id");

      expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
        UnscopedRelationError,
      );
    },
  );

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

    expect(() => compileClickhouseQuery(selectRaw, projectId)).toThrow(
      UnscopedRelationError,
    );
    expect(() => compileClickhouseQuery(whereRaw, projectId)).toThrow(
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

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
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

    const { sql: compiled, params } = compileClickhouseQuery(qb, projectId);
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

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
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

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled).toMatch(/t\.project_id/i);
    const matches = compiled.match(/project_id/gi) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  describe("CTE named like a tenanted table", () => {
    const db = getClickhouseKysely();
    const tracesCte = db.with("traces", (qb) =>
      qb.selectFrom("scores").select("trace_id as id"),
    );
    const compile = (
      query: Parameters<typeof compileClickhouseQuery>[0],
    ): string => compileClickhouseQuery(query, projectId).sql;

    it("leaves a scalar subquery's read of an outer CTE unscoped", () => {
      expect(
        compile(
          tracesCte
            .selectFrom("scores as s")
            .select((eb) => [
              eb.selectFrom("traces").select("id").limit(1).as("first_id"),
            ]),
        ),
      ).toBe(
        "with traces as (select trace_id as id from scores where project_id = {p1:String}) select (select id from traces limit {p2:Int64}) as first_id from scores as s where s.project_id = {p1:String}",
      );
    });

    it("leaves IN-subquery, FROM-subquery and UNION reads of an outer CTE unscoped", () => {
      expect(
        compile(
          tracesCte
            .selectFrom((eb) => eb.selectFrom("traces").select("id").as("sub"))
            .select("sub.id")
            .where("sub.id", "in", (eb) => eb.selectFrom("traces").select("id"))
            .unionAll(db.selectFrom("traces").select("id")),
        ),
      ).toBe(
        "with traces as (select trace_id as id from scores where project_id = {p1:String}) select sub.id from (select id from traces) as sub where sub.id in (select id from traces) union all select id from traces",
      );
    });

    it("leaves a nested CTE body's read of an outer CTE unscoped", () => {
      expect(
        compile(
          tracesCte
            .selectFrom(
              db
                .with("inner", (qb) => qb.selectFrom("traces").select("id"))
                .selectFrom("inner")
                .select("id")
                .as("sub"),
            )
            .select("sub.id"),
        ),
      ).toBe(
        "with traces as (select trace_id as id from scores where project_id = {p1:String}) select sub.id from (with inner as (select id from traces) select id from inner) as sub",
      );
    });

    it("scopes a CTE body's read of its own name, which is the table", () => {
      expect(
        compile(
          db
            .with("traces", (qb) =>
              qb
                .selectFrom("traces")
                .select("id")
                .where("id", "in", (eb) =>
                  eb.selectFrom("traces").select("id"),
                ),
            )
            .selectFrom("traces")
            .select("id"),
        ),
      ).toBe(
        "with traces as (select id from traces where project_id = {p1:String} and id in (select id from traces where project_id = {p1:String})) select id from traces",
      );
    });

    it("resolves a nested CTE body's own name to an outer CTE of that name", () => {
      expect(
        compile(
          tracesCte
            .selectFrom(
              db
                .with("traces", (qb) => qb.selectFrom("traces").select("id"))
                .selectFrom("traces")
                .select("id")
                .as("sub"),
            )
            .select("sub.id"),
        ),
      ).toBe(
        "with traces as (select trace_id as id from scores where project_id = {p1:String}) select sub.id from (with traces as (select id from traces) select id from traces) as sub",
      );
    });

    it("resolves earlier and later sibling CTE names to the CTE", () => {
      expect(
        compile(
          db
            .with("before", (qb) => qb.selectFrom("traces").select("id"))
            .with("traces", (qb) =>
              qb.selectFrom("scores").select("trace_id as id"),
            )
            .with("after", (qb) => qb.selectFrom("traces").select("id"))
            .selectFrom("before")
            .innerJoin("after", (join) =>
              join.onRef("before.id", "=", "after.id"),
            )
            .select("before.id"),
        ),
      ).toBe(
        "with before as (select id from traces), traces as (select trace_id as id from scores where project_id = {p1:String}), after as (select id from traces) select before.id from before inner join after on before.id = after.id",
      );
    });

    // Each case is a cycle between sibling CTEs. Reading `traces` reads
    // `observations`, which reads `traces` while it is still being resolved,
    // so ClickHouse reads the physical `traces` table there. The pass treats
    // that read as the CTE and would leave it unscoped, so the cycle is
    // rejected whether or not the main select reads it.
    it.each([
      [
        // traces → observations → traces.
        "directly",
        () =>
          db
            .with("traces", (qb) =>
              qb.selectFrom("observations").select("trace_id as id"),
            )
            .with("observations", (qb) =>
              qb.selectFrom("traces").select("id as trace_id"),
            )
            .selectFrom("traces")
            .select("id"),
      ],
      [
        // traces → observations (in an IN subquery of its body) → traces.
        "through a nested subquery",
        () =>
          db
            .with("traces", (qb) =>
              qb
                .selectFrom("scores")
                .select("trace_id as id")
                .where("trace_id", "in", (eb) =>
                  eb.selectFrom("observations").select("trace_id"),
                ),
            )
            .with("observations", (qb) =>
              qb.selectFrom("traces").select("id as trace_id"),
            )
            .selectFrom("scores")
            .select("id"),
      ],
      [
        // traces → observations → scores → traces.
        "through a third CTE",
        () =>
          db
            .with("traces", (qb) =>
              qb.selectFrom("observations").select("trace_id as id"),
            )
            .with("observations", (qb) =>
              qb.selectFrom("scores").select("trace_id"),
            )
            .with("scores", (qb) =>
              qb.selectFrom("traces").select("id as trace_id"),
            )
            .selectFrom("traces")
            .select("id"),
      ],
      [
        // traces → observations (read as `o`) → traces.
        "through an aliased read",
        () =>
          db
            .with("traces", (qb) =>
              qb.selectFrom("observations as o").select("o.trace_id as id"),
            )
            .with("observations", (qb) =>
              qb.selectFrom("traces").select("id as trace_id"),
            )
            .selectFrom("traces")
            .select("id"),
      ],
      [
        // traces → scores (read with FINAL) → traces.
        "through a FINAL read",
        () =>
          db
            .with("traces", (qb) =>
              qb
                .selectFrom("scores")
                .select("trace_id as id")
                .$call(useFinal(["scores"])),
            )
            .with("scores", (qb) =>
              qb.selectFrom("traces").select("id as trace_id"),
            )
            .selectFrom("traces")
            .select("id"),
      ],
      [
        // traces → observations (the joined side) → traces.
        "through a JOIN",
        () =>
          db
            .with("traces", (qb) =>
              qb
                .selectFrom("scores as s")
                .innerJoin("observations as o", "o.trace_id", "s.trace_id")
                .select("s.trace_id as id"),
            )
            .with("observations", (qb) =>
              qb.selectFrom("traces").select("id as trace_id"),
            )
            .selectFrom("traces")
            .select("id"),
      ],
    ])("rejects sibling CTEs that read each other %s", (_, build) => {
      expect(() => compile(build())).toThrow(UnscopedRelationError);
    });

    it("scopes a recursive CTE body's read of its own name as the table", () => {
      expect(
        compile(
          db
            .withRecursive("traces(id)", (qb) =>
              qb.selectFrom("traces").select("id"),
            )
            .selectFrom("traces")
            .select("id"),
        ),
      ).toBe(
        "with recursive traces(id) as (select id from traces where project_id = {p1:String}) select id from traces",
      );
    });

    it("rejects a CTE body written as raw SQL that reads a relation", () => {
      expect(() =>
        compile(
          db
            .with("a", () => sql<{ id: string }>`select id from traces`)
            .selectFrom("a")
            .select("id"),
        ),
      ).toThrow(UnscopedRelationError);
    });

    it("rejects a nested WITH that redirects an enclosing CTE body's read", () => {
      // Read inside `sub`, `traces` reads the inner `observations`, which reads
      // `a`, which reads `traces` while it is still being resolved: the table.
      expect(() =>
        compile(
          db
            .with("traces", (qb) =>
              qb.selectFrom("observations").select("trace_id as id"),
            )
            .with("observations", (qb) =>
              qb.selectFrom("scores").select("trace_id"),
            )
            .with("a", (qb) => qb.selectFrom("traces").select("id"))
            .selectFrom(
              db
                .withTables<{ a: { id: string } }>()
                .with("observations", (qb) =>
                  qb.selectFrom("a").select("id as trace_id"),
                )
                .selectFrom("traces")
                .select("id")
                .as("sub"),
            )
            .select("sub.id"),
        ),
      ).toThrow(UnscopedRelationError);
    });

    it("rejects a nested WITH that redirects a CTE body's own-name read", () => {
      // The `traces` CTE inside `a` reads its own name, which escapes to the
      // `traces` CTE in scope where `a` is read.
      expect(() =>
        compile(
          db
            .with("a", (qb) =>
              qb
                .selectFrom(
                  db
                    .with("traces", (inner) =>
                      inner.selectFrom("traces").select("id"),
                    )
                    .selectFrom("traces")
                    .select("id")
                    .as("sub"),
                )
                .select("sub.id"),
            )
            .selectFrom(
              db
                .withTables<{ a: { id: string } }>()
                .with("traces", (qb) =>
                  qb.selectFrom("scores").select("trace_id as id"),
                )
                .selectFrom("a")
                .select("id")
                .as("u"),
            )
            .select("u.id"),
        ),
      ).toThrow(UnscopedRelationError);
    });

    it("accepts a CTE body that reads its own nested CTE", () => {
      expect(
        compile(
          db
            .with("a", (qb) =>
              qb
                .selectFrom(
                  db
                    .with("x", (inner) =>
                      inner.selectFrom("scores").select("trace_id"),
                    )
                    .selectFrom("x")
                    .select("trace_id")
                    .as("sub"),
                )
                .select("sub.trace_id"),
            )
            .selectFrom("a")
            .select("trace_id"),
        ),
      ).toBe(
        "with a as (select sub.trace_id from (with x as (select trace_id from scores where project_id = {p1:String}) select trace_id from x) as sub) select trace_id from a",
      );
    });

    it("accepts a CTE body that reads its own nested CTE from a deeper subquery", () => {
      expect(
        compile(
          db
            .with("a", (qb) =>
              qb
                .selectFrom(
                  db
                    .with("x", (inner) =>
                      inner.selectFrom("scores").select("trace_id"),
                    )
                    .selectFrom((eb) =>
                      eb.selectFrom("x").select("trace_id").as("s2"),
                    )
                    .select("s2.trace_id")
                    .as("sub"),
                )
                .select("sub.trace_id"),
            )
            .selectFrom("a")
            .select("trace_id"),
        ),
      ).toBe(
        "with a as (select sub.trace_id from (with x as (select trace_id from scores where project_id = {p1:String}) select s2.trace_id from (select trace_id from x) as s2) as sub) select trace_id from a",
      );
    });

    it("accepts a nested CTE body that reads an enclosing nested CTE", () => {
      expect(
        compile(
          db
            .with("a", (qb) =>
              qb
                .selectFrom(
                  db
                    .with("x", (inner) =>
                      inner.selectFrom("scores").select("trace_id"),
                    )
                    .selectFrom(
                      db
                        .withTables<{ x: { trace_id: string } }>()
                        .with("y", (inner) =>
                          inner.selectFrom("x").select("trace_id"),
                        )
                        .selectFrom("y")
                        .select("trace_id")
                        .as("s2"),
                    )
                    .select("s2.trace_id")
                    .as("sub"),
                )
                .select("sub.trace_id"),
            )
            .selectFrom("a")
            .select("trace_id"),
        ),
      ).toBe(
        "with a as (select sub.trace_id from (with x as (select trace_id from scores where project_id = {p1:String}) select s2.trace_id from (with y as (select trace_id from x) select trace_id from y) as s2) as sub) select trace_id from a",
      );
    });

    it("does not count a schema-qualified read as a sibling read", () => {
      expect(
        compile(
          db
            .with("traces", (qb) =>
              qb
                .withSchema("default")
                .selectFrom("observations")
                .select("trace_id as id"),
            )
            .with("observations", (qb) =>
              qb.selectFrom("traces").select("id as trace_id"),
            )
            .selectFrom("observations")
            .select("trace_id"),
        ),
      ).toBe(
        "with traces as (select trace_id as id from default.observations where project_id = {p1:String}), observations as (select id as trace_id from traces) select trace_id from observations",
      );
    });

    it("does not count a column qualifier named like a sibling as a read", () => {
      expect(
        compile(
          db
            .with("a", (qb) =>
              qb.selectFrom("scores as traces").select("traces.id"),
            )
            .with("traces", (qb) => qb.selectFrom("a").select("id"))
            .selectFrom("traces")
            .select("id"),
        ),
      ).toBe(
        "with a as (select traces.id from scores as traces where traces.project_id = {p1:String}), traces as (select id from a) select id from traces",
      );
    });

    it("scopes a schema-qualified table named like a CTE in scope", () => {
      expect(
        compile(
          tracesCte
            .selectFrom("traces")
            .select("id")
            .where(
              "id",
              "in",
              db.withSchema("default").selectFrom("traces").select("id"),
            ),
        ),
      ).toBe(
        "with traces as (select trace_id as id from scores where project_id = {p1:String}) select id from traces where id in (select id from default.traces where project_id = {p1:String})",
      );
    });

    it("scopes the table again once a subquery leaves the CTE's select", () => {
      expect(
        compile(
          db
            .selectFrom("scores as s")
            .select("s.id")
            .where(
              "s.trace_id",
              "in",
              db
                .with("traces", (qb) =>
                  qb.selectFrom("scores").select("trace_id as id"),
                )
                .selectFrom("traces")
                .select("id"),
            )
            .where("s.trace_id", "in", (eb) =>
              eb.selectFrom("traces").select("id"),
            ),
        ),
      ).toBe(
        "select s.id from scores as s where s.project_id = {p1:String} and s.trace_id in (with traces as (select trace_id as id from scores where project_id = {p1:String}) select id from traces) and s.trace_id in (select id from traces where project_id = {p1:String})",
      );
    });
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
      .withPlugin(new TenancyInjectionPlugin(projectId))
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

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
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
      .withPlugin(new TenancyInjectionPlugin(projectId))
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

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    const lower = compiled.toLowerCase();
    expect(lower).toContain("limit ");
    expect(lower).toContain(" by ");
    expect(lower.indexOf(" by ")).toBeLessThan(lower.lastIndexOf("limit"));
  });

  it("wraps the scores FROM table in a FinalTableNode", () => {
    const qb = getClickhouseKysely()
      .selectFrom("scores as s")
      .select("s.id")
      .$call(useFinal(["scores"]));

    const node = qb
      .withPlugin(new TenancyInjectionPlugin(projectId))
      .toOperationNode();
    expect(node.kind).toBe("SelectQueryNode");
    const from = (node as { from?: { froms?: Array<{ kind: string }> } }).from
      ?.froms?.[0];
    expect(from).toBeDefined();
    expect(FinalTableNode.is(from!)).toBe(true);
  });

  it("emits FINAL after the scores table expression", () => {
    const qb = getClickhouseKysely()
      .selectFrom("scores as s")
      .select("s.id")
      .$call(useFinal(["scores"]));

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toMatch(/from scores as s final/);
    expect(compiled.toLowerCase()).not.toMatch(/from scores as s,/);
  });

  it("rejects FINAL on events_core", () => {
    expect(() => useFinal(["events_core"])).toThrow(QueryCompileError);
    expect(() => useFinal(["events_core"])).toThrow(/immutable/);
  });
});
