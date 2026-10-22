import { createQueryId, FromNode, SelectQueryNode } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError } from "./errors";
import { includeDeleted, limitBy, softDeleteAfterLimit } from "./extensions";
import { finalTable } from "./nodes";
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
      events: "is_deleted",
      events_core: "is_deleted",
      events_full: "is_deleted",
      events_truncated: "is_deleted",
    });
  });

  it("qualifies an unaliased FROM by table name, so a same-named SELECT alias cannot capture it", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events")
          .select((eb) => ["span_id", eb.lit(0).as("is_deleted")]),
      ),
    ).toMatchInlineSnapshot(
      `"select span_id, 0 as is_deleted from events_core as events where events.project_id = {p1:String} and events.is_deleted = 0"`,
    );
  });

  it("prepends to an existing WHERE and qualifies an aliased FROM", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events as e")
          .select("e.span_id")
          .where("e.trace_id", "=", "t"),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id from events_core as e where e.project_id = {p1:String} and e.is_deleted = 0 and e.trace_id = {p2:String}"`,
    );
  });

  it("puts a joined soft-delete table's filter in its ON clause", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .leftJoin("events as e", (join) =>
            join.onRef("e.trace_id", "=", "s.trace_id"),
          )
          .select("s.id"),
      ),
    ).toMatchInlineSnapshot(
      `"select s.id from scores as s left join events_core as e on e.trace_id = s.trace_id and e.is_deleted = 0 and e.project_id = {p1:String} where s.project_id = {p1:String}"`,
    );
  });

  it("puts a cross-joined soft-delete table's filter in WHERE", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .crossJoin("events as e")
          .select("s.id"),
      ),
    ).toMatch(/ where s\.project_id = \{p1:String\} and e\.is_deleted = 0$/);
  });

  it("filters inside CTE bodies, subqueries, and UNION branches", () => {
    const db = getClickhouseKysely();
    expect(
      compile(
        db
          .with("ev", (qb) => qb.selectFrom("events").select("trace_id"))
          .selectFrom("scores as s")
          .select("s.id")
          .where("s.trace_id", "in", (eb) =>
            eb.selectFrom("events").select("trace_id"),
          )
          .where("s.trace_id", "in", (eb) =>
            eb.selectFrom("ev").select("trace_id"),
          )
          .unionAll(db.selectFrom("events").select("span_id as id")),
      ),
    ).toMatchInlineSnapshot(
      `"with ev as (select trace_id from events_core as events where events.project_id = {p1:String} and events.is_deleted = 0) select s.id from scores as s where s.project_id = {p1:String} and s.trace_id in (select trace_id from events_core as events where events.project_id = {p1:String} and events.is_deleted = 0) and s.trace_id in (select trace_id from ev) union all select span_id as id from events_core as events where events.project_id = {p1:String} and events.is_deleted = 0"`,
    );
  });

  it("filters the inner select of a FROM subquery, not the outer one", () => {
    const db = getClickhouseKysely();
    expect(
      compile(
        db
          .selectFrom(db.selectFrom("events").select("span_id").as("sub"))
          .select("sub.span_id"),
      ),
    ).toMatchInlineSnapshot(
      `"select sub.span_id from (select span_id from events_core as events where events.project_id = {p1:String} and events.is_deleted = 0) as sub"`,
    );
  });

  it("filters a soft-delete table wrapped in FINAL", () => {
    // No soft-delete table allows FINAL yet, so the node is built by hand.
    const node = getClickhouseKysely()
      .selectFrom("events as e")
      .select("e.span_id")
      .toOperationNode();
    if (!SelectQueryNode.is(node) || !node.from)
      throw new Error("not a select");
    const filtered = new SoftDeleteFilterPlugin().transformQuery({
      node: {
        ...node,
        from: FromNode.create([finalTable(node.from.froms[0])]),
      },
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
          .selectFrom("events as e")
          .$call(includeDeleted())
          .select("e.span_id")
          .where("e.trace_id", "in", (eb) =>
            eb.selectFrom("events").select("trace_id"),
          ),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id from events_core as e where e.project_id = {p1:String} and e.trace_id in (select trace_id from events_core as events where events.project_id = {p1:String} and events.is_deleted = 0)"`,
    );
  });

  it("rejects RIGHT and FULL joins on a select that reads a soft-delete table", () => {
    expect(() =>
      compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .rightJoin("events as e", (join) =>
            join.onRef("e.trace_id", "=", "s.trace_id"),
          )
          .select("e.span_id"),
      ),
    ).toThrow(QueryCompileError);
    expect(() =>
      compile(
        getClickhouseKysely()
          .selectFrom("events as e")
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
          .rightJoin("events as e", (join) =>
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
          .innerJoin("events as e", (join) =>
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
          .selectFrom("events")
          .$call(includeDeleted())
          .select("span_id")
          .orderBy("event_ts", "desc")
          .$call(limitBy({ count: 1, columns: (eb) => [eb.ref("span_id")] })),
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
          .with("ev", (qb) => qb.selectFrom("events").select("trace_id"))
          .selectFrom("ev")
          .$call(includeDeleted())
          .select("trace_id"),
      ),
    ).toThrow(QueryCompileError);
  });

  it("softDeleteAfterLimit() filters after the pick, projecting outputs by name", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events as e")
          .$call(softDeleteAfterLimit())
          .select((eb) => [
            "e.span_id as id",
            "e.event_ts",
            "e.input",
            eb.fn<number>("length", ["e.output"]).as("len"),
          ])
          .where("e.span_id", "=", "o")
          .orderBy("e.event_ts", "desc")
          .limit(1),
      ),
    ).toMatchInlineSnapshot(
      `"select latest.id, latest.event_ts, latest.input, latest.len from (select e.span_id as id, e.event_ts, e.input, length(e.output) as len, e.is_deleted as is_deleted from events_full as e where e.project_id = {p1:String} and e.span_id = {p2:String} order by e.event_ts desc limit {p3:Int64}) as latest where latest.is_deleted = 0"`,
    );
  });

  it("softDeleteAfterLimit() wraps a CTE body and keeps its LIMIT BY inside", () => {
    expect(
      compile(
        getClickhouseKysely()
          .with("latest_events", () =>
            getClickhouseKysely()
              .selectFrom("events as e")
              .$call(softDeleteAfterLimit())
              .select(["e.span_id as span_id", "e.trace_id as trace_id"])
              .orderBy("e.event_ts", "desc")
              .$call(
                limitBy({ count: 1, columns: (eb) => [eb.ref("e.span_id")] }),
              ),
          )
          .selectFrom("latest_events as e")
          .select("e.trace_id"),
      ),
    ).toMatchInlineSnapshot(
      `"with latest_events as (select latest.span_id, latest.trace_id from (select e.span_id as span_id, e.trace_id as trace_id, e.is_deleted as is_deleted from events_core as e where e.project_id = {p1:String} order by e.event_ts desc limit 1 by e.span_id) as latest where latest.is_deleted = 0) select e.trace_id from latest_events as e"`,
    );
  });

  it("softDeleteAfterLimit() qualifies the flag by table name on an unaliased FROM", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events")
          .$call(softDeleteAfterLimit())
          .select("span_id")
          .limit(1),
      ),
    ).toMatchInlineSnapshot(
      `"select latest.span_id from (select span_id, events.is_deleted as is_deleted from events_core as events where events.project_id = {p1:String} limit {p2:Int64}) as latest where latest.is_deleted = 0"`,
    );
  });

  it("softDeleteAfterLimit() leaves nested selects filtered", () => {
    expect(
      compile(
        getClickhouseKysely()
          .selectFrom("events as e")
          .$call(softDeleteAfterLimit())
          .select("e.span_id")
          .where("e.trace_id", "in", (eb) =>
            eb.selectFrom("events").select("trace_id"),
          )
          .limit(1),
      ),
    ).toContain("events.is_deleted = 0");
  });

  it("rejects softDeleteAfterLimit() on selects it cannot wrap", () => {
    const marked = () =>
      getClickhouseKysely()
        .selectFrom("events_truncated as e")
        .$call(softDeleteAfterLimit())
        .limit(1);
    const rejects = (
      builder: Parameters<typeof compileClickhouseQuery>[0],
      message: RegExp,
    ) => expect(() => compile(builder)).toThrow(message);

    rejects(marked(), /without outputs/);
    rejects(
      getClickhouseKysely()
        .selectFrom("events_truncated as e")
        .$call(softDeleteAfterLimit())
        .select("e.span_id"),
      /needs a LIMIT or LIMIT BY/,
    );
    rejects(
      marked().select("e.trace_id").groupBy("e.trace_id"),
      /cannot wrap a GROUP BY or set operation/,
    );
    rejects(
      marked()
        .select("e.span_id")
        .unionAll(
          getClickhouseKysely()
            .selectFrom("events_truncated")
            .select("span_id"),
        ),
      /cannot wrap a GROUP BY or set operation/,
    );
    rejects(marked().selectAll(), /every output named/);
    rejects(marked().selectAll("e"), /every output named/);
    rejects(marked().select("e.is_deleted"), /adds `is_deleted` itself/);
    rejects(
      marked().select((eb) => [eb.lit(0).as("is_deleted")]),
      /adds `is_deleted` itself/,
    );
    rejects(
      getClickhouseKysely()
        .selectFrom("scores")
        .$call(softDeleteAfterLimit())
        .select("id"),
      /reads 0/,
    );
    rejects(
      marked()
        .innerJoin("events_truncated as f", (join) =>
          join.onRef("f.span_id", "=", "e.span_id"),
        )
        .select("e.span_id"),
      /reads 2/,
    );
    rejects(
      getClickhouseKysely()
        .selectFrom("scores as s")
        .leftJoin("events_truncated as e", (join) =>
          join.onRef("e.trace_id", "=", "s.trace_id"),
        )
        .$call(softDeleteAfterLimit())
        .select("s.id")
        .limit(1),
      /cannot wrap a LeftJoin/,
    );
    rejects(
      marked()
        .rightJoin("scores as s", (join) =>
          join.onRef("s.trace_id", "=", "e.trace_id"),
        )
        .select("s.id"),
      /cannot wrap a RightJoin/,
    );
    rejects(marked().distinct().select("e.span_id"), /cannot wrap a DISTINCT/);
    rejects(
      marked().$call(includeDeleted()).select("e.span_id"),
      /cannot mark the same select/,
    );
  });
});
