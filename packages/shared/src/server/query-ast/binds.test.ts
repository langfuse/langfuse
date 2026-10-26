import { TupleParam } from "@clickhouse/client";
import { sql as sql_ } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError } from "./errors";
import { arrayJoin, countIf, literal, tupleIn, useFinal } from "./extensions";

const projectId = "proj-1";
const START = new Date("2026-01-01T00:00:00.000Z");

function compile(builder: Parameters<typeof compileClickhouseQuery>[0]) {
  return compileClickhouseQuery(builder, projectId);
}

describe("typed params from the column registry", () => {
  it("binds an integer compared to a Float column as Float64, not Int64", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("scores")
        .select("id")
        .where("value", ">", 1),
    );
    expect(sql).toMatch(/value > \{p\d+:Float64\}/);
    expect(sql).not.toMatch(/\{p\d+:Int64\}/);
    expect(Object.values(params)).toContain(1);
  });

  it("binds an IN list against a Float column as Array(Float64)", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores")
        .select("id")
        .where("value", "in", [1, 2]),
    );
    expect(sql).toMatch(/value in \(\{p\d+:Array\(Float64\)\}\)/);
  });

  it("binds a number compared to total_cost as Decimal(18, 12)", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("span_id")
        .where("total_cost", ">", 1),
    );
    expect(sql).toMatch(/total_cost > \{p\d+:Decimal\(18, 12\)\}/);
  });

  it("wraps an IN list against an Array column as Array(Array(...))", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("span_id")
        .where("metadata_names", "in", [["a"], ["b"]]),
    );
    expect(sql).toMatch(
      /metadata_names in \(\{p\d+:Array\(Array\(String\)\)\}\)/,
    );
    expect(sql).not.toMatch(/metadata_names in \(\{p\d+:Array\(String\)\}\)/);
  });

  it("inlines an IN list of literals", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("span_id")
        .where("name", "in", [literal("a"), literal("it's")]),
    );
    expect(sql).toMatch(/name in \('a', 'it''s'\)/);
    expect(Object.values(params)).not.toContain("a");
  });

  it("binds an IN list of value expressions as one array", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("span_id")
        .where((eb) => eb("name", "in", [eb.val("a"), eb.val("b")])),
    );
    expect(sql).toMatch(/name in \(\{p\d+:Array\(String\)\}\)/);
  });

  it("rejects an IN list mixing literals and bound values", () => {
    expect(() =>
      compile(
        getClickhouseKysely()
          .selectFrom("events")
          .select("span_id")
          .where((eb) => eb("name", "in", [literal("a"), eb.val("b")])),
      ),
    ).toThrow(QueryCompileError);
  });

  it("keeps the column's DateTime precision through toStartOfMinute / toDate", () => {
    const { sql: minuteSql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("span_id")
        .where((eb) =>
          eb(
            eb.fn("toStartOfMinute", ["start_time"]),
            "=",
            eb.fn("toStartOfMinute", [eb.val(START)]),
          ),
        ),
    );
    expect(minuteSql).toMatch(
      /toStartOfMinute\(start_time\) = toStartOfMinute\(\{p\d+:DateTime64\(6\)\}\)/,
    );

    const { sql: dateSql } = compile(
      getClickhouseKysely()
        .selectFrom("traces as t")
        .select("id")
        .where((eb) =>
          eb(
            eb.fn("toDate", [eb.ref("t.timestamp")]),
            "=",
            eb.fn("toDate", [eb.val(START)]),
          ),
        ),
    );
    expect(dateSql).toMatch(
      /toDate\(t\.timestamp\) = toDate\(\{p\d+:DateTime64\(3\)\}\)/,
    );
  });

  // Rows are written as UTC wall-clock strings that ClickHouse parses in the
  // server timezone; Date binds must take the same form to match them.
  it("binds a Date as the UTC wall-clock string ingestion writes", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("span_id")
        .where("start_time", ">=", new Date(-1000))
        .where("start_time", "<=", START),
    );
    expect(sql).toMatch(/start_time >= \{p\d+:DateTime64\(6\)\}/);
    expect(Object.values(params)).toEqual(
      expect.arrayContaining([
        "1969-12-31 23:59:59.000",
        "2026-01-01 00:00:00.000",
      ]),
    );
  });

  it("binds a shared column name with the type of the table it is read from", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .where("e.start_time", ">=", START)
        .where("e.trace_id", "in", (qb) =>
          qb
            .selectFrom("observations")
            .select("trace_id")
            .where("start_time", ">=", START),
        ),
    );
    expect(sql).toMatch(/e\.start_time >= \{p\d+:DateTime64\(6\)\}/);
    expect(sql).toMatch(
      /where project_id = .* and start_time >= \{p\d+:DateTime64\(3\)\}/,
    );
  });

  it("resolves the bind type through a FINAL table", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores as s")
        .select("s.id")
        .where("s.event_ts", ">=", START)
        .$call(useFinal(["scores"])),
    );
    expect(sql).toMatch(/s\.event_ts >= \{p\d+:DateTime64\(3\)\}/);
  });

  it("resolves a qualifier declared in an enclosing select", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("observations as o")
              .select("o.trace_id")
              .where("e.start_time", ">=", START),
          ),
        ),
    );
    expect(sql).toMatch(/e\.start_time >= \{p\d+:DateTime64\(6\)\}/);
  });

  // A CTE or subquery column keeps the type of the column it selects.
  it.each([
    [
      "an aliased CTE column read through a table alias",
      () =>
        getClickhouseKysely()
          .with("recent", (db) =>
            db.selectFrom("events as e").select("e.start_time as ts"),
          )
          .selectFrom("recent as r")
          .select("r.ts")
          .where("r.ts", ">=", START),
    ],
    [
      "a CTE reading an earlier CTE",
      () =>
        getClickhouseKysely()
          .with("first", (db) => db.selectFrom("events").select("start_time"))
          .with("second", (db) => db.selectFrom("first").selectAll())
          .selectFrom("second")
          .select("start_time")
          .where("start_time", ">=", START),
    ],
    [
      "an aliased subquery in FROM",
      () =>
        getClickhouseKysely()
          .selectFrom((db) =>
            db.selectFrom("events").select("start_time").as("sub"),
          )
          .select("sub.start_time")
          .where("sub.start_time", ">=", START),
    ],
    [
      "a type-preserving aggregate in a CTE",
      () =>
        getClickhouseKysely()
          .with("bounds", (db) =>
            db
              .selectFrom("events")
              .select((eb) => eb.fn.max("start_time").as("start_time")),
          )
          .selectFrom("bounds")
          .select("start_time")
          .where("start_time", ">=", START),
    ],
    [
      "max written as a plain function",
      () =>
        getClickhouseKysely()
          .with("bounds", (db) =>
            db
              .selectFrom("events")
              .select((eb) =>
                eb.fn<Date>("max", ["start_time"]).as("start_time"),
              ),
          )
          .selectFrom("bounds")
          .select("start_time")
          .where("start_time", ">=", START),
    ],
    [
      "argMax",
      () =>
        getClickhouseKysely()
          .with("latest", (db) =>
            db
              .selectFrom("events")
              .select((eb) =>
                eb
                  .fn<Date>("argMax", ["start_time", "event_ts"])
                  .as("start_time"),
              ),
          )
          .selectFrom("latest")
          .select("start_time")
          .where("start_time", ">=", START),
    ],
    [
      "anyLast",
      () =>
        getClickhouseKysely()
          .with("latest", (db) =>
            db
              .selectFrom("events")
              .select((eb) => eb.fn<Date>("anyLast", ["start_time"]).as("ts")),
          )
          .selectFrom("latest")
          .select("ts")
          .where("ts", ">=", START),
    ],
    [
      "a qualified * in a CTE",
      () =>
        getClickhouseKysely()
          .with("rows", (db) =>
            db.selectFrom("events_truncated as e").selectAll("e"),
          )
          .selectFrom("rows")
          .select("start_time")
          .where("start_time", ">=", START),
    ],
  ])("propagates the source column type through %s", (_, build) => {
    const { sql } = compile(build());
    expect(sql).toMatch(/(start_time|ts) >= \{p\d+:DateTime64\(6\)\}/);
  });

  // `events_core.start_time` is DateTime64(6); a Date bound against a column
  // the compiler can't type binds as DateTime64(3). Which one a bind gets
  // shows which relation a name resolved to.
  describe("CTE name resolution", () => {
    const db = getClickhouseKysely();
    const withX = db.with("x", (qb) =>
      qb.selectFrom("events").select("start_time"),
    );

    it("types a subquery's read of an enclosing CTE from its body", () => {
      const { sql } = compile(
        withX
          .selectFrom((qb) =>
            qb
              .selectFrom("x")
              .select("start_time")
              .where("start_time", ">=", START)
              .as("sub"),
          )
          .select("sub.start_time"),
      );
      expect(sql).toMatch(/start_time >= \{p\d+:DateTime64\(6\)\}\) as sub$/);
    });

    it("does not let a CTE body see the declaring select's FROM aliases", () => {
      // Inside the body, `o` names nothing, so binding against `o.start_time`
      // is rejected instead of taking the outer `events_core as o` type.
      expect(() =>
        compile(
          db
            .with("y", (qb) =>
              qb
                .selectFrom("events")
                .select("span_id")
                .where(db.dynamic.ref("o.start_time"), ">=", START),
            )
            .selectFrom("events as o")
            .select("o.span_id"),
        ),
      ).toThrow(/no relation in scope is named "o"/);
    });
  });

  it("propagates the source column type through a JOIN to an aliased subquery", () => {
    const db = getClickhouseKysely();
    const sub = db
      .selectFrom("events")
      .select(["trace_id", "start_time"])
      .as("sub");
    const { sql } = compile(
      db
        .selectFrom("observations as o")
        .innerJoin(sub, "sub.trace_id", "o.trace_id")
        .select("o.trace_id")
        .where("sub.start_time", ">=", START),
    );
    expect(sql).toMatch(/sub\.start_time >= \{p\d+:DateTime64\(6\)\}/);
  });

  // ClickHouse resolves `start_time` to the alias, not to either joined column.
  it("binds a select alias with the type of the column it names", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events as e")
        .innerJoin("observations as o", "o.trace_id", "e.trace_id")
        .select((eb) => eb.fn.max("e.start_time").as("start_time"))
        .groupBy("e.trace_id")
        .having("start_time", ">", START),
    );
    expect(sql).toMatch(/start_time > \{p\d+:DateTime64\(6\)\}/);
  });

  it("binds a computed select alias by value, not as the column it shadows", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores")
        .select((eb) => eb.fn.countAll().as("value"))
        .groupBy("trace_id")
        .having("value", ">", 1),
    );
    expect(sql).toMatch(/value > \{p\d+:Int64\}/);
  });

  // ClickHouse resolves `v2` through `value` to `count()`, a UInt64.
  // Inside its own expression, `total_cost` is the column, not the alias.
  it("types a comparison inside an aggregate aliased to the column's name", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select((eb) => countIf(eb("total_cost", ">", 1)).as("total_cost"))
        .groupBy("trace_id"),
    );
    expect(sql).toMatch(/total_cost > \{p\d+:Decimal\(18, 12\)\}/);
  });

  it("binds an alias of a computed alias by value", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores")
        .select((eb) => [
          eb.fn.countAll().as("value"),
          sql_.ref("value").as("v2"),
        ])
        .groupBy("trace_id")
        .having(sql_.ref("v2"), ">", 1),
    );
    expect(sql).toMatch(/v2 > \{p\d+:Int64\}/);
  });

  // ClickHouse resolves `start_time` to the ARRAY JOIN element, a String.
  it("binds an ARRAY JOIN alias by value, not as the column it shadows", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .$call(arrayJoin((eb) => ({ start_time: eb.ref("e.metadata_names") })))
        .where(sql_.ref("start_time"), "=", "x"),
    );
    expect(sql).toMatch(/start_time = \{p\d+:String\}/);
  });

  // `kv.1` reads a tuple element of the ARRAY JOIN alias, not a relation.
  it("binds a tuple element of an ARRAY JOIN alias by value", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .$call(arrayJoin((eb) => ({ kv: eb.ref("e.metadata_names") })))
        .where(sql_.ref("kv.1"), "=", "a"),
    );
    expect(sql).toMatch(/kv\.1 = \{p\d+:String\}/);
  });

  // A raw fragment around a column is not the column: `length(...)` is a number.
  it("binds a raw expression around a sql.ref column by value", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_truncated as e")
        .select("e.span_id")
        .where(sql_<number>`length(${sql_.ref("e.input")})`, ">", 5),
    );
    expect(sql).toMatch(/length\(e\.input\) > \{p\d+:Int64\}/);
  });

  describe("columns the compiler can't resolve to a relation", () => {
    const db = getClickhouseKysely();

    it("binds by value when no relation in scope has the column", () => {
      const { sql } = compile(
        db
          .selectFrom("traces")
          .select("id")
          .where(db.dynamic.ref("total_cost"), ">", 1),
      );
      expect(sql).toMatch(/total_cost > \{p\d+:Int64\}/);
    });

    it("binds by value a column named like an Object prototype key", () => {
      // `scores` has no `constructor` column; the lookup must not find
      // `Object.prototype.constructor` instead.
      const { sql } = compile(
        db
          .selectFrom("scores as s")
          .select("s.id")
          .where(db.dynamic.ref("s.constructor"), ">", 1),
      );
      expect(sql).toMatch(/s\.constructor > \{p\d+:Int64\}/);
    });

    it("binds by value a CTE column named like an Object prototype key", () => {
      // The CTE's output columns are typed from its body, which has no
      // `constructor` column either.
      const { sql } = compile(
        db
          .with("c", (qb) => qb.selectFrom("traces").select("id"))
          .selectFrom("c")
          .select("c.id")
          .where(db.dynamic.ref("c.constructor"), ">", 1),
      );
      expect(sql).toMatch(/c\.constructor > \{p\d+:Int64\}/);
    });

    it("binds by value a column named like an Object prototype key through a CTE *", () => {
      // The `*` expands to the columns of `traces`, which has no `constructor`.
      const { sql } = compile(
        db
          .with("c", (qb) => qb.selectFrom("traces").selectAll())
          .selectFrom("c")
          .select("c.id")
          .where(db.dynamic.ref("c.constructor"), ">", 1),
      );
      expect(sql).toMatch(/c\.constructor > \{p\d+:Int64\}/);
    });

    it("binds a named raw-SQL CTE column by value", () => {
      const { sql } = compile(
        db
          .with("t", (qb) =>
            qb
              .selectFrom("events_truncated")
              .select(sql_`is_deleted`.as("is_deleted")),
          )
          .selectFrom("t")
          .select("is_deleted")
          .where("is_deleted", "=", 0),
      );
      expect(sql).toMatch(/is_deleted = \{p\d+:Int64\}/);
    });

    // `t` outputs only span_id, so is_deleted is not typed by its name.
    it("binds by value a column the CTE does not output", () => {
      const { sql } = compile(
        db
          .with("t", (qb) => qb.selectFrom("events").select("span_id"))
          .selectFrom("t")
          .select("span_id")
          .where(db.dynamic.ref("is_deleted"), "=", 0),
      );
      expect(sql).toMatch(/is_deleted = \{p\d+:Int64\}/);
    });

    // Nothing is bound, so the column's type is never needed.
    it("compiles an unresolvable column compared to an inlined constant", () => {
      const { sql } = compile(
        db
          .selectFrom("events")
          .select("span_id")
          .where((eb) => eb(db.dynamic.ref("x.is_deleted"), "=", eb.lit(0))),
      );
      expect(sql).toContain("x.is_deleted = 0");
    });

    it.each([
      [
        // No FROM or JOIN in scope is named `x`.
        "a qualifier declared nowhere",
        () =>
          db
            .selectFrom("events")
            .select("span_id")
            .where(db.dynamic.ref("x.is_deleted"), "=", 0),
        /no relation in scope is named "x"/,
      ],
      [
        // start_time is DateTime64(3) on observations, DateTime64(6) on events.
        "an unqualified column the joined relations type differently",
        () =>
          db
            .selectFrom("events as e")
            .innerJoin("observations as o", "o.trace_id", "e.trace_id")
            .select("e.span_id")
            .where("start_time", ">=", START),
        /joined relations give it different types/,
      ],
      [
        // `t` outputs value computed (UInt64); scores types it Float64.
        "an unqualified column one relation outputs computed and another types",
        () =>
          db
            .with("t", (qb) =>
              qb
                .selectFrom("scores")
                .select((eb) => [eb.fn.countAll().as("value"), "trace_id"])
                .groupBy("trace_id"),
            )
            .selectFrom("t")
            .innerJoin("scores as s", "s.trace_id", "t.trace_id")
            .select("s.id")
            .where("value", ">", 1),
        /different types \(.*a computed value.*\)/,
      ],
      [
        // `sql.ref` names a column like a plain reference does.
        "a sql.ref column whose qualifier is declared nowhere",
        () =>
          db
            .selectFrom("events")
            .select("span_id")
            .where(sql_.ref("x.is_deleted"), "=", 0),
        /no relation in scope is named "x"/,
      ],
      [
        "a CTE qualified * whose qualifier no relation declares",
        () =>
          db
            .with("t", (qb) =>
              qb.selectFrom("events as e").selectAll("x" as never),
            )
            .selectFrom("t as t")
            .select(db.dynamic.ref("t.span_id"))
            .where(db.dynamic.ref("t.start_time"), ">=", START),
        /It selects x\.\* but no relation in that select is named "x"/,
      ],
      [
        // `t` selects `x.*` over no relation named `x`, so its columns are
        // unknown and may include trace_id.
        "an unqualified column next to a CTE whose columns are unknown",
        () =>
          db
            .with("t", (qb) =>
              qb.selectFrom("events as e").selectAll("x" as never),
            )
            .selectFrom("scores as s")
            .innerJoin("t", (join) => join.onTrue())
            .select("s.id")
            .where("trace_id", "=", "x"),
        /may come from a relation whose columns are unknown/,
      ],
      [
        // Each tuple position takes its column's type; `x.a` has none.
        "a TupleParam whose tuple has a column declared nowhere",
        () =>
          db
            .selectFrom("events as e")
            .select("e.span_id")
            .where((eb) =>
              tupleIn(eb.refTuple(db.dynamic.ref("x.a"), "e.span_id"), [
                new TupleParam(["a", "s"]),
              ]),
            ),
        /no relation in scope is named "x"/,
      ],
      [
        // Each value binds with the type of the column at its position.
        "a tuple of values against a tuple with a column declared nowhere",
        () =>
          db
            .selectFrom("events as e")
            .select("e.span_id")
            .where((eb) =>
              eb(eb.refTuple(db.dynamic.ref("x.a"), "e.span_id"), "in", [
                eb.tuple("a", "s"),
              ]),
            ),
        /no relation in scope is named "x"/,
      ],
      [
        // An empty list has no value to infer from, so `x.a` decides its type.
        "an empty TupleParam list whose tuple has a column declared nowhere",
        () =>
          db
            .selectFrom("events as e")
            .select("e.span_id")
            .where((eb) =>
              tupleIn(eb.refTuple(db.dynamic.ref("x.a"), "e.span_id"), []),
            ),
        /no relation in scope is named "x"/,
      ],
      [
        // An IN list binds an array of the column's type.
        "an IN list against a qualifier declared nowhere",
        () =>
          db
            .selectFrom("events")
            .select("span_id")
            .where(db.dynamic.ref("x.trace_id"), "in", ["a", "b"]),
        /no relation in scope is named "x"/,
      ],
    ])("rejects a value bound against %s", (_, build, message) => {
      expect(() => compile(build())).toThrow(QueryCompileError);
      expect(() => compile(build())).toThrow(message);
    });
  });

  it("does not propagate the source type through a type-changing aggregate", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .with("totals", (db) =>
          db
            .selectFrom("events")
            .select((eb) => eb.fn.count("prompt_version").as("prompt_version")),
        )
        .selectFrom("totals")
        .select("prompt_version")
        .where("prompt_version", ">=", 1),
    );
    expect(sql).toMatch(/prompt_version >= \{p\d+:Int64\}/);
  });

  it("does not type extra date-wrapper arguments as the column", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("span_id")
        .where((eb) =>
          eb(
            eb.fn("toStartOfDay", ["start_time", eb.val("UTC")]),
            ">=",
            "2026-01-01 00:00:00.000",
          ),
        ),
    );
    expect(sql).toMatch(/toStartOfDay\(start_time, \{p\d+:String\}\)/);
  });

  it("does not type a subquery LIMIT from an outer column comparison", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select("trace_id")
        .where(
          "trace_id",
          "in",
          getClickhouseKysely().selectFrom("traces").select("id").limit(3),
        ),
    );
    expect(sql).toMatch(/limit \{p\d+:Int64\}/);
    expect(sql).not.toMatch(/limit \{p\d+:String\}/);
  });

  it("binds a TupleParam list as Array(Tuple(...)) for a tuple IN", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .where((eb) =>
          tupleIn(eb.refTuple("e.trace_id", "e.span_id"), [
            new TupleParam(["t1", "s1"]),
          ]),
        ),
    );
    expect(sql).toMatch(
      /\(e\.trace_id, e\.span_id\) in \{p\d+:Array\(Tuple\(String, String\)\)\}/,
    );
    expect(Object.values(params)).toContainEqual([
      new TupleParam(["t1", "s1"]),
    ]);
  });

  it("binds a TupleParam list with the type of each tuple column", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores as s")
        .select("s.id")
        .where((eb) =>
          tupleIn(eb.refTuple("s.trace_id", "s.value"), [
            new TupleParam(["t1", 1]),
          ]),
        ),
    );
    expect(sql).toMatch(
      /\(s\.trace_id, s\.value\) in \{p\d+:Array\(Tuple\(String, Float64\)\)\}/,
    );
  });

  it("binds an empty TupleParam list with the tuple's column types", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores as s")
        .select("s.id")
        .where((eb) => tupleIn(eb.refTuple("s.trace_id", "s.value"), [])),
    );
    expect(sql).toMatch(
      /\(s\.trace_id, s\.value\) in \{p\d+:Array\(Tuple\(String, Float64\)\)\}/,
    );
  });

  it("binds each value of a tuple with the type of the column at its position", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores as s")
        .select("s.id")
        .where((eb) =>
          eb(eb.refTuple("s.trace_id", "s.value"), "in", [eb.tuple("t1", 1)]),
        ),
    );
    expect(sql).toMatch(
      /\(s\.trace_id, s\.value\) in \(\(\{p\d+:String\}, \{p\d+:Float64\}\)\)/,
    );
  });

  it("keeps the column types of a CTE that selects a referenced star", () => {
    const db = getClickhouseKysely();
    const { sql } = compile(
      db
        .with("t", (qb) =>
          qb.selectFrom("events_truncated as e").selectAll("e"),
        )
        .selectFrom("t as t")
        .select(db.dynamic.ref("t.span_id"))
        .where(db.dynamic.ref("t.start_time"), ">=", START),
    );
    expect(sql).toMatch(/t\.start_time >= \{p\d+:DateTime64\(6\)\}/);
  });

  // ClickHouse keeps `e.start_time` as `start_time` and renames `o.start_time`.
  it("types a CTE * over a join from the leftmost relation with the column", () => {
    const db = getClickhouseKysely();
    const { sql } = compile(
      db
        .with("t", (qb) =>
          qb
            .selectFrom("events_truncated as e")
            .innerJoin("observations as o", "o.trace_id", "e.trace_id")
            .selectAll(),
        )
        .selectFrom("t as t")
        .select("t.span_id")
        .where("t.start_time", ">=", START),
    );
    expect(sql).toMatch(/t\.start_time >= \{p\d+:DateTime64\(6\)\}/);
  });

  it("binds a sql.ref column with its registry type", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("scores")
        .select("id")
        .where(sql_.ref("value"), ">", 1),
    );
    expect(sql).toMatch(/value > \{p\d+:Float64\}/);
  });

  it("binds distinct bare TupleParams as separate Tuple(...) placeholders", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("events")
        .select((eb) => [
          eb.val(new TupleParam(["a", 1])).as("first"),
          eb.val(new TupleParam(["b", 2])).as("second"),
        ]),
    );
    const placeholders = sql.match(/\{p\d+:Tuple\(String, Int64\)\}/g);
    expect(new Set(placeholders)).toHaveProperty("size", 2);
    expect(Object.values(params)).toEqual(
      expect.arrayContaining([
        new TupleParam(["a", 1]),
        new TupleParam(["b", 2]),
      ]),
    );
  });

  it("interns the same typed value to one placeholder across UNION branches", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("traces")
        .select("environment")
        .where("id", "=", "same")
        .unionAll(
          getClickhouseKysely()
            .selectFrom("observations")
            .select("environment")
            .where("trace_id", "=", "same"),
        ),
    );
    expect(
      Object.entries(params).filter(([, value]) => value === "same"),
    ).toHaveLength(1);
    const sameName = Object.entries(params).find(
      ([, value]) => value === "same",
    )?.[0];
    expect(sameName).toBeDefined();
    const occurrences = sql.split(`{${sameName}:String}`).length - 1;
    expect(occurrences).toBe(2);
  });
});
