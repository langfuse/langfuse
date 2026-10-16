import {
  createQueryId,
  FromNode,
  SelectQueryNode,
  type OperationNode,
} from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError } from "./errors";
import { includeDeleted, limitBy } from "./extensions";
import { FinalTableNode } from "./nodes";
import { SOFT_DELETE_COLUMNS } from "./schema";
import { SoftDeleteFilterPlugin } from "./softDelete";

// Raw compiler output, so these run without a `clickhouse` binary.
const projectId = "p";

function compile(builder: Parameters<typeof compileClickhouseQuery>[0]) {
  return compileClickhouseQuery(builder, projectId).sql;
}

describe("soft-delete filtering", () => {
  it("declares the flag on the events tables only", () => {
    expect(SOFT_DELETE_COLUMNS).toEqual({
      events_core: "is_deleted",
      events_full: "is_deleted",
    });
  });

  it("qualifies an unaliased FROM by table name, so a same-named SELECT alias cannot capture it", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events_core")
          .select((eb) => ["span_id", eb.lit(0).as("is_deleted")]),
      ),
    ).toMatchInlineSnapshot(
      `"select span_id, 0 as is_deleted from events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8}"`,
    );
  });

  it("prepends to an existing WHERE and qualifies an aliased FROM", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events_full as e")
          .select("e.span_id")
          .where("e.trace_id", "=", "t"),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id from events_full as e where e.project_id = {p1:String} and e.is_deleted = {p2:UInt8} and e.trace_id = {p3:String}"`,
    );
  });

  it("puts a joined soft-delete table's filter in its ON clause", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .leftJoin("events_core as e", (join) =>
            join.onRef("e.trace_id", "=", "s.trace_id"),
          )
          .select("s.id"),
      ),
    ).toMatchInlineSnapshot(
      `"select s.id from scores as s left join events_core as e on e.trace_id = s.trace_id and e.is_deleted = {p1:UInt8} and e.project_id = {p2:String} where s.project_id = {p2:String}"`,
    );
  });

  it("puts a cross-joined soft-delete table's filter in WHERE", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .crossJoin("events_core as e")
          .select("s.id"),
      ),
    ).toMatch(
      / where s\.project_id = \{p1:String\} and e\.is_deleted = \{p2:UInt8\}$/,
    );
  });

  it("filters inside CTE bodies, subqueries, and UNION branches", () => {
    const db = getClickhouseKysely();
    expect(
      compile(
        db
          .with("ev", (qb) => qb.selectFrom("events_core").select("trace_id"))
          .selectFrom("scores as s")
          .select("s.id")
          .where("s.trace_id", "in", (eb) =>
            eb.selectFrom("events_full").select("trace_id"),
          )
          .where("s.trace_id", "in", (eb) =>
            eb.selectFrom("ev").select("trace_id"),
          )
          .unionAll(db.selectFrom("events_core").select("span_id as id")),
      ),
    ).toMatchInlineSnapshot(
      `"with ev as (select trace_id from events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8}) select s.id from scores as s where s.project_id = {p1:String} and s.trace_id in (select trace_id from events_full where project_id = {p1:String} and events_full.is_deleted = {p2:UInt8}) and s.trace_id in (select trace_id from ev) union all select span_id as id from events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8}"`,
    );
  });

  it("filters the inner select of a FROM subquery, not the outer one", () => {
    const db = getClickhouseKysely();
    expect(
      compile(
        db
          .selectFrom(db.selectFrom("events_core").select("span_id").as("sub"))
          .select("sub.span_id"),
      ),
    ).toMatchInlineSnapshot(
      `"select sub.span_id from (select span_id from events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8}) as sub"`,
    );
  });

  it("treats a CTE named like a physical table as the CTE, in nested scopes too", () => {
    expect(
      compile(
        getClickhouseKysely()
          .with("events_core", (qb) =>
            qb.selectFrom("scores").select("trace_id"),
          )
          .selectFrom("events_core")
          .select("trace_id")
          .where("trace_id", "in", (eb) =>
            eb.selectFrom("events_core").select("trace_id"),
          ),
      ),
    ).not.toContain("is_deleted");
  });

  it("filters a schema-qualified table named like a CTE in scope", () => {
    const db = getClickhouseKysely();
    expect(
      compile(
        db
          .with("events_core", (qb) =>
            qb.selectFrom("scores").select("trace_id"),
          )
          .selectFrom("events_core")
          .select("trace_id")
          .where(
            "trace_id",
            "in",
            db
              .withSchema("default")
              .selectFrom("events_core")
              .select("trace_id"),
          ),
      ),
    ).toContain(
      "(select trace_id from default.events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8})",
    );
  });

  it("resolves a CTE body's own name to the table, and sibling CTE names to the CTE", () => {
    const sql = compile(
      getClickhouseKysely()
        .with("before", (qb) => qb.selectFrom("events_core").select("trace_id"))
        .with("events_core", (qb) =>
          qb.selectFrom("events_core").select("trace_id"),
        )
        .with("after", (qb) => qb.selectFrom("events_core").select("trace_id"))
        .selectFrom("after")
        .select("trace_id"),
    );
    expect(sql).toContain(
      "events_core as (select trace_id from events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8})",
    );
    expect(sql.match(/is_deleted/g)).toHaveLength(1);
  });

  it("filters a recursive CTE body that reads its own name, which is the table outside the recursive member", () => {
    expect(
      compile(
        getClickhouseKysely()
          .withRecursive("events_core(trace_id)", (qb) =>
            qb.selectFrom("events_core").select("trace_id"),
          )
          .selectFrom("events_core")
          .select("trace_id"),
      ),
    ).toContain(
      "(select trace_id from events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8})",
    );
  });

  it("filters a soft-delete table wrapped in FINAL", () => {
    // No soft-delete table allows FINAL yet, so the node is built by hand.
    // FinalTableNode is outside Kysely's node union, hence the cast.
    const node = getClickhouseKysely()
      .selectFrom("events_core as e")
      .select("e.span_id")
      .toOperationNode();
    if (!SelectQueryNode.is(node) || !node.from)
      throw new Error("not a select");
    const final = FinalTableNode.create(node.from.froms[0]) as unknown;
    const filtered = new SoftDeleteFilterPlugin().transformQuery({
      node: { ...node, from: FromNode.create([final as OperationNode]) },
      queryId: createQueryId(),
    });
    expect(SelectQueryNode.is(filtered) && filtered.where).toBeTruthy();
  });

  it("leaves tables without a soft-delete flag unchanged", () => {
    expect(
      compile(getClickhouseKysely().selectFrom("scores").select("id")),
    ).not.toContain("is_deleted");
  });

  it("includeDeleted() opts out its own select only", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events_core as e")
          .$call(includeDeleted())
          .select("e.span_id")
          .where("e.trace_id", "in", (eb) =>
            eb.selectFrom("events_core").select("trace_id"),
          ),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id from events_core as e where e.project_id = {p1:String} and e.trace_id in (select trace_id from events_core where project_id = {p1:String} and events_core.is_deleted = {p2:UInt8})"`,
    );
  });

  it("rejects RIGHT and FULL joins on a select that reads a soft-delete table", () => {
    expect(() =>
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .rightJoin("events_core as e", (join) =>
            join.onRef("e.trace_id", "=", "s.trace_id"),
          )
          .select("e.span_id"),
      ),
    ).toThrow(QueryCompileError);
    expect(() =>
      compile(
        getClickhouseKysely()
          .selectFrom("events_core as e")
          .fullJoin("scores as s", (join) =>
            join.onRef("s.trace_id", "=", "e.trace_id"),
          )
          .select("e.span_id"),
      ),
    ).toThrow(QueryCompileError);
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .rightJoin("events_core as e", (join) =>
            join.onRef("e.trace_id", "=", "s.trace_id"),
          )
          .$call(includeDeleted())
          .select("e.span_id"),
      ),
    ).not.toContain("is_deleted");
  });

  it("includeDeleted() accepts a soft-delete table that is only joined", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .innerJoin("events_core as e", (join) =>
            join.onRef("e.trace_id", "=", "s.trace_id"),
          )
          .$call(includeDeleted())
          .select("s.id"),
      ),
    ).not.toContain("is_deleted");
  });

  it("includeDeleted() survives a later ClickHouse plugin", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events_core")
          .$call(includeDeleted())
          .select("span_id")
          .orderBy("event_ts", "desc")
          .$call(limitBy({ count: 1, columns: ["span_id"] })),
      ),
    ).not.toContain("is_deleted");
  });

  it("rejects includeDeleted() on a select that reads no soft-delete table", () => {
    expect(() =>
      compile(
        getClickhouseKysely()
          .selectFrom("scores")
          .$call(includeDeleted())
          .select("id"),
      ),
    ).toThrow(QueryCompileError);
    expect(() =>
      compile(
        getClickhouseKysely()
          .with("events_core", (qb) =>
            qb.selectFrom("scores").select("trace_id"),
          )
          .selectFrom("events_core")
          .$call(includeDeleted())
          .select("trace_id"),
      ),
    ).toThrow(QueryCompileError);
  });
});
