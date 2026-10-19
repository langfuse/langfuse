import { TupleParam } from "@clickhouse/client";
import { sql as sql_ } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError, UnscopedRelationError } from "./errors";
import { tupleIn, useFinal } from "./extensions";

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
        .selectFrom("events_core")
        .select("span_id")
        .where("total_cost", ">", 1),
    );
    expect(sql).toMatch(/total_cost > \{p\d+:Decimal\(18, 12\)\}/);
  });

  it("wraps an IN list against an Array column as Array(Array(...))", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .where("metadata_names", "in", [["a"], ["b"]]),
    );
    expect(sql).toMatch(
      /metadata_names in \(\{p\d+:Array\(Array\(String\)\)\}\)/,
    );
    expect(sql).not.toMatch(/metadata_names in \(\{p\d+:Array\(String\)\}\)/);
  });

  it("keeps the column's DateTime precision through toStartOfMinute / toDate", () => {
    const { sql: minuteSql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
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
        .selectFrom("events_core")
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
        .selectFrom("events_core as e")
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
        .selectFrom("events_core as e")
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
      "a CTE named like a registry table",
      () =>
        getClickhouseKysely()
          .with("observations", (db) =>
            db.selectFrom("events_core").select("start_time"),
          )
          .selectFrom("observations")
          .select("start_time")
          .where("start_time", ">=", START),
    ],
    [
      "an aliased CTE column read through a table alias",
      () =>
        getClickhouseKysely()
          .with("recent", (db) =>
            db.selectFrom("events_core as e").select("e.start_time as ts"),
          )
          .selectFrom("recent as r")
          .select("r.ts")
          .where("r.ts", ">=", START),
    ],
    [
      "a CTE reading an earlier CTE",
      () =>
        getClickhouseKysely()
          .with("first", (db) =>
            db.selectFrom("events_core").select("start_time"),
          )
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
            db.selectFrom("events_core").select("start_time").as("sub"),
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
              .selectFrom("events_core")
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
              .selectFrom("events_core")
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
              .selectFrom("events_core")
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
              .selectFrom("events_core")
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
            db.selectFrom("events_core as e").selectAll("e"),
          )
          .selectFrom("rows")
          .select("start_time")
          .where("start_time", ">=", START),
    ],
  ])("propagates the source column type through %s", (_, build) => {
    const { sql } = compile(build());
    expect(sql).toMatch(/(start_time|ts) >= \{p\d+:DateTime64\(6\)\}/);
  });

  // `observations.start_time` is DateTime64(3); `events_core.start_time` is
  // DateTime64(6). Which one a bind gets shows which relation a name resolved to.
  describe("CTE name resolution", () => {
    const db = getClickhouseKysely();
    const eventsAsObservations = db.with("observations", (qb) =>
      qb.selectFrom("events_core").select("start_time"),
    );

    it("resolves a later sibling CTE name to the CTE", () => {
      const { sql } = compile(
        db
          .with("early", (qb) =>
            qb.selectFrom("observations").select("start_time"),
          )
          .with("observations", (qb) =>
            qb.selectFrom("events_core").select("start_time"),
          )
          .selectFrom("early")
          .select("start_time")
          .where("start_time", ">=", START),
      );
      expect(sql).toMatch(/start_time >= \{p\d+:DateTime64\(6\)\}$/);
    });

    it("resolves a CTE body's read of its own name to the table", () => {
      const { sql } = compile(
        db
          .with("observations", (qb) =>
            qb
              .selectFrom("events_core as e")
              .innerJoin("observations as o", "o.trace_id", "e.trace_id")
              .select("e.start_time")
              .where("o.start_time", ">=", START),
          )
          .selectFrom("observations")
          .select("start_time"),
      );
      expect(sql).toMatch(/o\.start_time >= \{p\d+:DateTime64\(3\)\}/);
    });

    it("types a CTE that reads its own name when it is first read in a subquery", () => {
      const { sql } = compile(
        db
          .with("observations", (qb) =>
            qb.selectFrom("observations").select(["trace_id", "start_time"]),
          )
          .selectFrom("traces")
          .select("id")
          .where(
            "id",
            "in",
            db
              .selectFrom("observations")
              .select("trace_id")
              .where("start_time", ">=", START),
          ),
      );
      expect(sql).toMatch(/start_time >= \{p\d+:DateTime64\(3\)\}/);
    });

    it("resolves a nested CTE body's own name to an outer CTE of that name", () => {
      const { sql } = compile(
        eventsAsObservations
          .selectFrom(
            db
              .with("observations", (qb) =>
                qb.selectFrom("observations").select("start_time"),
              )
              .selectFrom("observations")
              .select("start_time")
              .as("sub"),
          )
          .select("sub.start_time")
          .where("sub.start_time", ">=", START),
      );
      expect(sql).toMatch(/sub\.start_time >= \{p\d+:DateTime64\(6\)\}$/);
    });

    it("resolves a schema-qualified table to the table, not a CTE of its name", () => {
      const { sql } = compile(
        eventsAsObservations
          .selectFrom("observations")
          .select("start_time")
          .where(
            "start_time",
            "in",
            db
              .withSchema("default")
              .selectFrom("observations")
              .select("start_time")
              .where("start_time", ">=", START),
          ),
      );
      expect(sql).toMatch(
        /from default\.observations where project_id = \{p\d+:String\} and start_time >= \{p\d+:DateTime64\(3\)\}/,
      );
    });

    it("rejects CTEs that read each other", () => {
      expect(() =>
        compile(
          db
            .with("observations", (qb) =>
              qb.selectFrom("traces").select("timestamp as start_time"),
            )
            .with("traces", (qb) =>
              qb.selectFrom("observations").select("start_time as timestamp"),
            )
            .selectFrom("traces")
            .select("timestamp")
            .where("timestamp", ">=", START),
        ),
      ).toThrow(UnscopedRelationError);
    });
  });

  it("propagates the source column type through a JOIN to an aliased subquery", () => {
    const db = getClickhouseKysely();
    const sub = db
      .selectFrom("events_core")
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

  describe("columns the compiler can't resolve to a relation", () => {
    const db = getClickhouseKysely();
    // A table outside the registry: the compiler can't see its columns.
    const unregistered = db.withTables<{
      unregistered: { trace_id: string; start_time: Date };
    }>();

    it("binds by value when no relation in scope has the column", () => {
      const { sql } = compile(
        db
          .selectFrom("traces")
          .select("id")
          .where(db.dynamic.ref("total_cost"), ">", 1),
      );
      expect(sql).toMatch(/total_cost > \{p\d+:Int64\}/);
    });

    it("binds a named raw-SQL CTE column by value", () => {
      const { sql } = compile(
        db
          .with("t", (qb) =>
            qb
              .selectFrom("events_core")
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
          .with("t", (qb) => qb.selectFrom("events_core").select("span_id"))
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
          .selectFrom("events_core")
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
            .selectFrom("events_core")
            .select("span_id")
            .where(db.dynamic.ref("x.is_deleted"), "=", 0),
        /no relation in scope is named "x"/,
      ],
      [
        // `u` is declared, but its columns are unknown.
        "a qualified column of a table outside the registry",
        () =>
          unregistered
            .selectFrom("unregistered as u")
            .select("u.trace_id")
            .where("u.start_time", ">=", START),
        /columns of "u" are unknown/,
      ],
      [
        // start_time is DateTime64(3) on observations, DateTime64(6) on events.
        "an unqualified column the joined relations type differently",
        () =>
          db
            .selectFrom("events_core as e")
            .innerJoin("observations as o", "o.trace_id", "e.trace_id")
            .select("e.span_id")
            .where("start_time", ">=", START),
        /joined relations give it different types/,
      ],
      [
        // span_id is only on events_core in the registry, but `u` may have it.
        "an unqualified column next to a table outside the registry",
        () =>
          unregistered
            .selectFrom("events_core as e")
            .innerJoin("unregistered as u", "u.trace_id", "e.trace_id")
            .select("e.trace_id")
            .where("span_id", "=", "s"),
        /may come from a relation whose columns are unknown/,
      ],
      [
        // The CTE column carries the unknown type of `u.start_time`.
        "a CTE column selected from a table outside the registry",
        () =>
          unregistered
            .with("t", (qb) =>
              qb.selectFrom("unregistered as u").select("u.start_time"),
            )
            .selectFrom("t")
            .select("start_time")
            .where("start_time", ">=", START),
        /columns of "u" are unknown/,
      ],
      [
        // `t.start_time` is unknown, so the join can't settle the type either.
        "an unqualified CTE column of unknown type next to a registry relation",
        () =>
          unregistered
            .with("t", (qb) =>
              qb.selectFrom("unregistered as u").select("u.start_time"),
            )
            .selectFrom("t")
            .innerJoin("observations as o", "o.start_time", "t.start_time")
            .select("o.trace_id")
            .where("start_time", ">=", START),
        /columns of "u" are unknown/,
      ],
      [
        // `*` over an unregistered table yields unknown columns.
        "a CTE * over a table outside the registry",
        () =>
          unregistered
            .with("t", (qb) => qb.selectFrom("unregistered").selectAll())
            .selectFrom("t")
            .select("trace_id")
            .where("start_time", ">=", START),
        /may come from a relation whose columns are unknown/,
      ],
      [
        // Same, through a qualified `u.*`.
        "a CTE qualified * over a table outside the registry",
        () =>
          unregistered
            .with("t", (qb) =>
              qb.selectFrom("unregistered as u").selectAll("u"),
            )
            .selectFrom("t as t")
            .select("t.trace_id")
            .where("t.start_time", ">=", START),
        /columns of "t" are unknown/,
      ],
      [
        // An IN list binds an array of the column's type.
        "an IN list against a qualifier declared nowhere",
        () =>
          db
            .selectFrom("events_core")
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
            .selectFrom("events_core")
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
        .selectFrom("events_core")
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
        .selectFrom("events_core")
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
        .selectFrom("events_core as e")
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

  it("binds distinct bare TupleParams as separate Tuple(...) placeholders", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
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
