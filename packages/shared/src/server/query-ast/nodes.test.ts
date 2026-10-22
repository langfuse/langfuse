import {
  AliasNode,
  CommonTableExpressionNode,
  FromNode,
  SelectQueryNode,
  WithNode,
  createQueryId,
  sql,
  type KyselyPlugin,
  type OperationNode,
} from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { ClickHouseQueryCompiler } from "./compiler";
import { CteNamePlugin } from "./ctes";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { arrayJoin, limitBy, mapKeys, mapValues, useFinal } from "./extensions";
import {
  ArrayJoinNode,
  FinalTableNode,
  LimitByNode,
  finalTable,
  isClickHouseSelectQueryNode,
} from "./nodes";
import { TenancyInjectionPlugin } from "./tenancy";
import { defineView, fromView } from "./views";

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
    const qb = getClickhouseKysely().selectFrom("events").select("environment");

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
    const qb = getClickhouseKysely().selectFrom("events").select("environment");

    const { sql: compiled, params } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toContain("project_id");
    expect(Object.values(params)).toContain("proj-1");
  });

  it("does not duplicate project_id when the builder already scoped the table", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events")
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
    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      /Raw SQL table sources are rejected/,
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
        .selectFrom("events as e")
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

  // FINAL wraps the aliased item (`scores as s final`); the relation describer
  // peels one FINAL and then one alias, so any other nesting is no table
  // reference and cannot be scoped. No builder emits these; they are built by
  // hand.
  it.each([
    [
      "an alias around FINAL",
      (alias: AliasNode) =>
        AliasNode.create(finalTable(alias.node), alias.alias),
    ],
    ["FINAL around FINAL", (alias: AliasNode) => finalTable(finalTable(alias))],
  ])("rejects %s as a FROM source", (_shape, wrap) => {
    const rewrap: KyselyPlugin = {
      transformQuery(args) {
        const node = args.node;
        if (!SelectQueryNode.is(node) || !node.from) return node;
        const [from] = node.from.froms;
        if (!AliasNode.is(from)) return node;
        return { ...node, from: FromNode.create([wrap(from)]) };
      },
      async transformResult(args) {
        return args.result;
      },
    };
    const qb = getClickhouseKysely()
      .withPlugin(rewrap)
      .selectFrom("scores as s")
      .select("s.id");

    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      UnscopedRelationError,
    );
  });

  it("rejects raw SQL fragments in SELECT and WHERE, not only FROM/JOIN", () => {
    const selectRaw = getClickhouseKysely()
      .selectFrom("events_truncated")
      .select(
        sql<string>`(SELECT environment FROM traces LIMIT 1)`.as("stolen"),
      );

    const whereRaw = getClickhouseKysely()
      .selectFrom("events_truncated")
      .select("environment")
      .where(sql<boolean>`id IN (SELECT id FROM traces)`);

    expect(() => compileClickhouseQuery(selectRaw, projectId)).toThrow(
      UnscopedRelationError,
    );
    expect(() => compileClickhouseQuery(whereRaw, projectId)).toThrow(
      UnscopedRelationError,
    );
  });

  it("rejects a table reference inside raw SQL outside FROM/JOIN", () => {
    // `s.trace_id IN traces` reads every row of `traces`, unscoped.
    const qb = getClickhouseKysely()
      .selectFrom("scores as s")
      .select("s.id")
      .where(sql<boolean>`s.trace_id IN ${sql.table("traces")}`);

    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      /A table reference inside raw SQL/,
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
      .selectFrom("events")
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

  describe("CTE names", () => {
    const db = getClickhouseKysely();
    // Knows the CTE names `a` and `b` as tables, so a body can read a name
    // before its CTE is declared without a cast.
    const loose = db.withTables<{
      a: { id: string };
      b: { id: string };
    }>();
    const compile = (
      query: Parameters<typeof compileClickhouseQuery>[0],
    ): string => compileClickhouseQuery(query, projectId).sql;

    // Every pass treats a FROM/JOIN of a registry name as that table, so a
    // CTE of that name is rejected whether or not the query reads it. One
    // physical table, plus the logical `events` that has no table of its own.
    it.each(["traces", "events"] as const)(
      "rejects a CTE named like the registry table %s",
      (name) => {
        expect(() =>
          compile(
            db
              .with(name, (qb) => qb.selectFrom("scores").select("trace_id"))
              .selectFrom("scores")
              .select("id"),
          ),
        ).toThrow(`A CTE cannot be named "${name}"`);
      },
    );

    it("rejects a nested WITH named like a registry table", () => {
      // The WITH is declared in a FROM subquery, not at the root.
      expect(() =>
        compile(
          db
            .selectFrom(
              db
                .with("traces", (qb) =>
                  qb.selectFrom("scores").select("trace_id as id"),
                )
                .selectFrom("traces")
                .select("id")
                .as("sub"),
            )
            .select("sub.id"),
        ),
      ).toThrow(`A CTE cannot be named "traces"`);
    });

    it("rejects a view named like a registry table", () => {
      // `fromView` declares the view as a CTE of its name.
      const view = defineView("traces")<{ id: string }>(() =>
        db.selectFrom("scores").select("trace_id as id"),
      );
      expect(() => compile(fromView(view).select("id"))).toThrow(
        `A CTE cannot be named "traces"`,
      );
    });

    it.each([
      [
        // Two siblings of one WITH.
        "a sibling",
        () =>
          loose
            .with("a", (qb) => qb.selectFrom("scores").select("id"))
            .with("a", (qb) => qb.selectFrom("traces").select("id"))
            .selectFrom("a")
            .select("id"),
      ],
      [
        // A FROM subquery redeclares the root's `a`.
        "an enclosing select's CTE",
        () =>
          loose
            .with("a", (qb) => qb.selectFrom("scores").select("id"))
            .selectFrom(
              loose
                .with("a", (qb) => qb.selectFrom("traces").select("id"))
                .selectFrom("a")
                .select("id")
                .as("sub"),
            )
            .select("sub.id"),
      ],
    ])("rejects a CTE that reuses the name of %s", (_, build) => {
      expect(() => compile(build())).toThrow(`CTE "a" is declared twice`);
    });

    it("accepts the same CTE name in two separate subqueries", () => {
      // Neither `x` is in scope of the other.
      const sub = db
        .with("x", (qb) => qb.selectFrom("traces").select("id"))
        .selectFrom("x")
        .select("id");
      expect(
        compile(
          db
            .selectFrom(sub.as("l"))
            .innerJoin(sub.as("r"), "l.id", "r.id")
            .select("l.id"),
        ),
      ).toBe(
        "select l.id from (with x as (select id from traces where project_id = {p1:String}) select id from x) as l inner join (with x as (select id from traces where project_id = {p1:String}) select id from x) as r on l.id = r.id",
      );
    });

    // A CTE body sees only the CTEs declared before it. Reading its own name
    // or a later sibling is the only way to build a cycle, and ClickHouse
    // resolves a read inside a cycle to a table, not the CTE.
    it.each([
      [
        "its own name",
        () =>
          loose
            .with("a", (qb) => qb.selectFrom("a").select("id"))
            .selectFrom("a")
            .select("id"),
      ],
      [
        "its own name in an IN subquery",
        () =>
          loose
            .with("a", (qb) =>
              qb
                .selectFrom("traces")
                .select("id")
                .where("id", "in", (eb) => eb.selectFrom("a").select("id")),
            )
            .selectFrom("a")
            .select("id"),
      ],
      [
        "its own name under an alias",
        () =>
          loose
            .with("a", (qb) => qb.selectFrom("a as x").select("x.id"))
            .selectFrom("a")
            .select("id"),
      ],
      [
        "its own name on the joined side",
        () =>
          loose
            .with("a", (qb) =>
              qb
                .selectFrom("traces as t")
                .innerJoin("a", "a.id", "t.id")
                .select("t.id"),
            )
            .selectFrom("a")
            .select("id"),
      ],
      [
        "a later sibling",
        () =>
          loose
            .with("a", (qb) => qb.selectFrom("b").select("id"))
            .with("b", (qb) => qb.selectFrom("traces").select("id"))
            .selectFrom("a")
            .select("id"),
      ],
      [
        "itself through a recursive CTE",
        () =>
          loose
            .withRecursive("a(id)", (qb) => qb.selectFrom("a").select("id"))
            .selectFrom("a")
            .select("id"),
      ],
      [
        // `a` is read inside `sub`, where ClickHouse would resolve its `b`
        // to the nested `b`; where `a` is declared, `b` names nothing.
        "a CTE declared only where the body is read",
        () =>
          loose
            .with("a", (qb) => qb.selectFrom("b").select("id"))
            .selectFrom(
              loose
                .with("b", (qb) => qb.selectFrom("traces").select("id"))
                .selectFrom("a")
                .select("id")
                .as("sub"),
            )
            .select("sub.id"),
      ],
    ])("rejects a CTE body that reads %s", (_, build) => {
      expect(() => compile(build())).toThrow(UnscopedRelationError);
      expect(() => compile(build())).toThrow(
        "is neither a registry table nor a CTE in scope",
      );
    });

    it("rejects a CTE body that reads itself through FINAL", () => {
      // `useFinal` takes registry tables only, so the FINAL read is built by
      // hand. FinalTableNode is outside Kysely's node union, hence the cast.
      const node = loose
        .with("a", (qb) => qb.selectFrom("a").select("id"))
        .selectFrom("a")
        .select("id")
        .toOperationNode();
      const cte = node.with?.expressions[0];
      const body = cte?.expression;
      if (!cte || !body || !SelectQueryNode.is(body) || !body.from) {
        throw new Error("not a select");
      }
      const final = FinalTableNode.create(body.from.froms[0]) as unknown;
      const finalBody: SelectQueryNode = {
        ...body,
        from: FromNode.create([final as OperationNode]),
      };
      const withFinal = {
        ...node,
        with: WithNode.create(
          CommonTableExpressionNode.create(cte.name, finalBody),
        ),
      };
      const check = () =>
        new CteNamePlugin().transformQuery({
          node: withFinal,
          queryId: createQueryId(),
        });
      expect(check).toThrow(UnscopedRelationError);
      expect(check).toThrow(
        `"a" is neither a registry table nor a CTE in scope`,
      );
    });

    it.each(["traces ", "default.recent"])(
      "rejects the CTE name %j, which is not a plain identifier",
      (name) => {
        // The compiler writes a CTE name verbatim, so `traces ` would reach
        // ClickHouse as `traces` while the passes read `traces` as the table.
        expect(() =>
          compile(
            db
              .with(name, (qb) => qb.selectFrom("scores").select("trace_id"))
              .selectFrom("scores")
              .select("id"),
          ),
        ).toThrow("is not a plain identifier");
      },
    );

    it("accepts a nested WITH that reuses the name of the CTE whose body it is in", () => {
      // Inside its own body `a` is not in scope, so the nested `a` is the
      // only `a` the body can read.
      expect(
        compile(
          loose
            .with("a", () =>
              loose
                .with("a", (qb) => qb.selectFrom("traces").select("id"))
                .selectFrom("a")
                .select("id"),
            )
            .selectFrom("a")
            .select("id"),
        ),
      ).toBe(
        "with a as (with a as (select id from traces where project_id = {p1:String}) select id from a) select id from a",
      );
    });

    it("accepts reads of an earlier sibling, an enclosing CTE and a CTE of the body's own WITH", () => {
      expect(
        compile(
          db
            .with("x", (qb) => qb.selectFrom("traces").select("id"))
            .with("y", (qb) =>
              qb
                .selectFrom("x")
                .select("id")
                .where(
                  "id",
                  "in",
                  qb
                    .with("z", (inner) => inner.selectFrom("x").select("id"))
                    .selectFrom("z")
                    .select("id"),
                ),
            )
            .selectFrom("y")
            .select("id"),
        ),
      ).toBe(
        "with x as (select id from traces where project_id = {p1:String}), y as (select id from x where id in (with z as (select id from x) select id from z)) select id from y",
      );
    });

    it("rejects a schema-qualified read, even of a registry table", () => {
      // The registry describes `traces`, not `default.traces` or
      // `otherdb.traces`; the read is in a CTE body, so the walk reaches it.
      const build = () =>
        compile(
          db
            .with("a", (qb) =>
              qb.withSchema("otherdb").selectFrom("traces").select("id"),
            )
            .selectFrom("a")
            .select("id"),
        );
      expect(build).toThrow(UnscopedRelationError);
      expect(build).toThrow(`"otherdb.traces" is schema-qualified`);
    });

    it("has the compiler reject a table outside the registry that skipped the CTE check", () => {
      // Only tenancy runs here, so the unregistered `a` reaches the compiler,
      // which must not guess its column types.
      const node = loose
        .selectFrom("a")
        .select("id")
        .where("id", "=", "x")
        .toOperationNode();
      const stamped = new TenancyInjectionPlugin(projectId).transformQuery({
        node,
        queryId: createQueryId(),
      });
      const check = () =>
        new ClickHouseQueryCompiler().compileQuery(stamped, createQueryId());
      expect(check).toThrow(UnscopedRelationError);
      expect(check).toThrow(`"a" is not a registry table`);
    });

    it("accepts a CTE named like an Object prototype key", () => {
      // The registry lookups of the soft-delete and dedup passes must not
      // find `Object.prototype.constructor` for it.
      expect(
        compile(
          db
            .with("constructor", (qb) => qb.selectFrom("traces").select("id"))
            .selectFrom("constructor")
            .select("id"),
        ),
      ).toBe(
        "with constructor as (select id from traces where project_id = {p1:String}) select id from constructor",
      );
    });

    it("does not count a column qualifier as a read", () => {
      // `b.id` qualifies a column of the alias `b`; the body reads `traces`.
      expect(
        compile(
          loose
            .with("a", (qb) => qb.selectFrom("traces as b").select("b.id"))
            .with("b", (qb) => qb.selectFrom("traces").select("id"))
            .selectFrom("a")
            .select("id"),
        ),
      ).toBe(
        "with a as (select b.id from traces as b where b.project_id = {p1:String}), b as (select id from traces where project_id = {p1:String}) select id from a",
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
  });
});

describe("ARRAY JOIN and LIMIT BY nodes", () => {
  it("attaches a real ArrayJoinNode, not a RawNode", () => {
    const qb = getClickhouseKysely()
      .selectFrom("observations")
      .select("environment")
      .where("project_id", "=", "proj-1")
      .$call(
        arrayJoin((eb) => ({
          cost_key: mapKeys(eb.ref("cost_details")),
          cost: mapValues(eb.ref("cost_details")),
        })),
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
      .$call(
        arrayJoin((eb) => ({ cost_key: mapKeys(eb.ref("cost_details")) })),
      );

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toContain("array join");
    expect(compiled.toLowerCase()).toContain(
      "mapkeys(cost_details) as cost_key",
    );
  });

  it("attaches a real LimitByNode", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events")
      .select("span_id")
      .where("project_id", "=", "proj-1")
      .$call(
        limitBy({
          count: 1,
          columns: (eb) => [eb.ref("span_id"), eb.ref("project_id")],
        }),
      );

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

  it("emits the ARRAY JOIN variant", () => {
    const qb = getClickhouseKysely()
      .selectFrom("observations")
      .select("environment")
      .$call(
        arrayJoin(
          (eb) => ({ cost_key: mapKeys(eb.ref("cost_details")) }),
          "left",
        ),
      );

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toContain(
      "left array join mapkeys(cost_details) as cost_key",
    );
  });

  it("emits the LIMIT BY count", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events")
      .select("span_id")
      .$call(limitBy({ count: 2, columns: (eb) => [eb.ref("span_id")] }));

    const { sql: compiled } = compileClickhouseQuery(qb, projectId);
    expect(compiled.toLowerCase()).toContain("limit 2 by span_id");
  });

  it("emits LIMIT BY before a plain LIMIT", () => {
    const qb = getClickhouseKysely()
      .selectFrom("events")
      .select("span_id")
      .where("project_id", "=", "proj-1")
      .limit(50)
      .$call(limitBy({ count: 1, columns: (eb) => [eb.ref("span_id")] }));

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
    expect(() => useFinal(["events"])).toThrow(QueryCompileError);
    expect(() => useFinal(["events"])).toThrow(/immutable/);
  });
});

describe("names the compiler writes verbatim", () => {
  const db = getClickhouseKysely();

  it.each(["columns ", "tuple(s.comment), length", "default.f"])(
    "rejects the function name %j",
    (name) => {
      expect(() =>
        compileClickhouseQuery(
          db
            .selectFrom("scores as s")
            .select((eb) => eb.fn<string>(name, [eb.val("x")]).as("x")),
          projectId,
        ),
      ).toThrow(QueryCompileError);
      expect(() =>
        compileClickhouseQuery(
          db
            .selectFrom("scores as s")
            .select((eb) => eb.fn.agg<string>(name, [eb.val("x")]).as("x")),
          projectId,
        ),
      ).toThrow(QueryCompileError);
    },
  );

  // Identifiers are written unquoted, so a name that is not a plain identifier
  // is raw SQL: the select alias `x from scores --` emits
  // `select s.id as x from scores -- from scores as s where project_id = …`,
  // which comments out the tenancy predicate.
  it.each([
    [
      "select alias",
      db
        .selectFrom("scores as s")
        .select((eb) => eb.ref("s.id").as("x from scores --")),
    ],
    ["table alias", db.selectFrom("scores as s --").select("s --.id")],
    [
      "subquery alias",
      db
        .selectFrom(db.selectFrom("scores as s").select("s.id").as("sub, t"))
        .select("sub, t.id"),
    ],
    [
      "CTE name",
      db
        .with("c --", (qb) => qb.selectFrom("scores as s").select("s.id"))
        .selectFrom("c --")
        .select("id"),
    ],
    [
      "sql.ref column",
      db
        .selectFrom("scores as s")
        .select(sql.ref<string>("s.id from scores --").as("x")),
    ],
    [
      "sql.ref star",
      db.selectFrom("scores as s").select(sql.ref<string>("s.*").as("x")),
    ],
    // An index only reads a tuple element after a qualifier; alone, `1` would
    // compile to the literal 1 instead of a column.
    [
      "sql.ref unqualified tuple index",
      db.selectFrom("scores as s").select(sql.ref<string>("1").as("x")),
    ],
    // Tuple indexes start at 1; ClickHouse rejects `s.0`.
    [
      "sql.ref zero tuple index",
      db.selectFrom("scores as s").select(sql.ref<string>("s.0").as("x")),
    ],
    // Only a whole integer is a tuple index; text after it is raw SQL.
    [
      "sql.ref tuple index followed by text",
      db
        .selectFrom("scores as s")
        .select(sql.ref<string>("s.1 from scores --").as("x")),
    ],
    [
      "sql.id",
      db.selectFrom("scores as s").select(sql.id("s", "id --").as("x")),
    ],
    [
      "array join alias",
      db
        .selectFrom("observations")
        .select("environment")
        .$call(
          arrayJoin((eb) => ({
            "cost_key --": mapKeys(eb.ref("cost_details")),
          })),
        ),
    ],
  ])("rejects a non-plain identifier in a %s", (_kind, qb) => {
    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      QueryCompileError,
    );
    expect(() => compileClickhouseQuery(qb, projectId)).toThrow(
      /not a plain identifier/,
    );
  });

  it("writes a positive integer after a qualifier as a tuple element", () => {
    const { sql: compiled } = compileClickhouseQuery(
      db.selectFrom("scores as s").select(sql.ref<string>("s.1").as("x")),
      projectId,
    );
    expect(compiled).toContain("select s.1 as x from scores as s");
  });

  // ClickHouse parses only a string literal after `collate`, which Kysely
  // does not emit.
  it.each(["en", "'en', s.comment"])(
    "rejects the collation %j",
    (collation) => {
      expect(() =>
        compileClickhouseQuery(
          db
            .selectFrom("scores as s")
            .select("s.id")
            .orderBy("s.name", (ob) => ob.collate(collation)),
          projectId,
        ),
      ).toThrow(QueryCompileError);
    },
  );
});
