import { sql as sql_ } from "kysely";
import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { useFinal } from "./extensions";

const ctx = { projectId: "proj-1" };
const START = new Date("2026-01-01T00:00:00.000Z");

function compile(builder: Parameters<typeof compileClickhouseQuery>[0]) {
  return compileClickhouseQuery(builder, ctx);
}

describe("typed params from the column registry", () => {
  it("binds an integer compared to total_cost as Float64, not Int64", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .where("total_cost", ">", 1),
    );
    expect(sql).toMatch(/total_cost > \{p\d+:Float64\}/);
    expect(sql).not.toMatch(/\{p\d+:Int64\}/);
    expect(Object.values(params)).toContain(1);
  });

  it("binds an IN list against a Float column as Array(Float64)", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .where("total_cost", "in", [1, 2]),
    );
    expect(sql).toMatch(/total_cost in \(\{p\d+:Array\(Float64\)\}\)/);
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
    const start = "2026-01-01 00:00:00.000";
    const { sql: minuteSql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .where((eb) =>
          eb(
            eb.fn("toStartOfMinute", ["start_time"]),
            "=",
            eb.fn("toStartOfMinute", [eb.val(start)]),
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
            eb.fn("toDate", [eb.val(start)]),
          ),
        ),
    );
    expect(dateSql).toMatch(
      /toDate\(t\.timestamp\) = toDate\(\{p\d+:DateTime64\(3\)\}\)/,
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

  // When the column's table can't be resolved, the bind type falls back to the
  // JS value: a Date binds as DateTime64(3), even against events.
  it.each([
    [
      "a JOIN where an unqualified column exists with different types",
      () =>
        getClickhouseKysely()
          .selectFrom("events_core as e")
          .innerJoin("observations as o", "o.trace_id", "e.trace_id")
          .select("e.span_id")
          .where("start_time", ">=", START),
    ],
  ])("falls back to value inference for %s", (_, build) => {
    const { sql } = compile(build());
    expect(sql).toMatch(/start_time >= \{p\d+:DateTime64\(3\)\}/);
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

    it("uses the name-only type for a table-function source", () => {
      const { sql } = compile(
        db
          .selectFrom((eb) => eb.fn("numbers", [eb.lit(10)]).as("n"))
          .selectAll()
          .where(db.dynamic.ref("n.is_deleted"), "=", 0),
      );
      expect(sql).toMatch(/n\.is_deleted = \{p\d+:UInt8\}/);
    });

    it("uses the name-only type for a qualifier declared nowhere", () => {
      const { sql } = compile(
        db
          .selectFrom("events_core")
          .select("span_id")
          .where(db.dynamic.ref("x.is_deleted"), "=", 0),
      );
      expect(sql).toMatch(/x\.is_deleted = \{p\d+:UInt8\}/);
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
