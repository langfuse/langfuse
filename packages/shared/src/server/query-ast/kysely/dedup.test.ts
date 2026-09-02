import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { limitBy } from "./extensions";

const ctx = { projectId: "proj-1" };

function compile(builder: Parameters<typeof compileClickhouseQuery>[0]) {
  return compileClickhouseQuery(builder, ctx);
}

describe("shape-keyed dedup lowering", () => {
  it("injects LIMIT 1 BY the registry key on a row read", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select(["span_id", "project_id"]),
    );
    const lower = sql.toLowerCase();
    expect(lower).toMatch(/order by event_ts desc/);
    expect(lower).toMatch(/limit 1 by span_id, project_id/);
  });

  it("qualifies LIMIT BY columns when the FROM is aliased", () => {
    const { sql } = compile(
      getClickhouseKysely().selectFrom("events_core as e").select("e.span_id"),
    );
    const lower = sql.toLowerCase();
    expect(lower).toMatch(/order by e\.event_ts desc/);
    expect(lower).toMatch(/limit 1 by e\.span_id, e\.project_id/);
  });

  it("appends the version sort after a caller-supplied ORDER BY", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .orderBy("start_time", "desc"),
    );
    const lower = sql.toLowerCase();
    expect(lower.indexOf("start_time desc")).toBeLessThan(
      lower.indexOf("event_ts desc"),
    );
    expect(lower).toMatch(/limit 1 by span_id, project_id/);
  });

  it("does not duplicate LIMIT BY when the caller already attached one", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .orderBy("event_ts", "desc")
        .$call(limitBy({ count: 1, columns: ["span_id", "project_id"] })),
    );
    expect(sql.toLowerCase().split("limit 1 by").length - 1).toBe(1);
  });

  it("wraps aggregations so LIMIT BY runs before GROUP BY", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select((eb) => ["environment", eb.fn.countAll().as("n")])
        .groupBy("environment"),
    );
    const lower = sql.toLowerCase();
    // Inner subquery carries the row idiom; outer keeps the GROUP BY.
    expect(lower).toMatch(
      /from \(select \* from events_core[\s\S]*order by event_ts desc[\s\S]*limit 1 by span_id, project_id\) as events_core/,
    );
    expect(lower).toMatch(/group by environment/);
    // One LIMIT BY, on the inner select — not after GROUP BY.
    expect(lower.split("limit 1 by").length - 1).toBe(1);
  });

  it("wraps window functions so they see one row per key", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select((eb) => [
          "span_id",
          eb.fn
            .agg("rank")
            .over((ob) =>
              ob.partitionBy("trace_id").orderBy("start_time", "desc"),
            )
            .as("rk"),
        ]),
    );
    const lower = sql.toLowerCase();
    expect(lower).toMatch(/from \(select \*/);
    expect(lower).toMatch(/limit 1 by span_id, project_id/);
    expect(lower).toMatch(/rank\(\) over/);
  });

  it("skips DISTINCT-only reads (already collapsed)", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("environment")
        .distinct(),
    );
    expect(sql.toLowerCase()).not.toContain("limit 1 by");
  });

  it("skips scalar max() (already collapses versions)", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select((eb) => [eb.fn.max("event_ts").as("m")]),
    );
    expect(sql.toLowerCase()).not.toContain("limit 1 by");
  });

  it("skips existence checks (SELECT 1 LIMIT 1)", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select((eb) => [eb.val(1).as("ok")])
        .limit(1),
    );
    expect(sql.toLowerCase()).not.toContain("limit 1 by");
  });

  it("skips tables that declare no dedup spec", () => {
    const { sql } = compile(
      getClickhouseKysely().selectFrom("traces").select("id"),
    );
    expect(sql.toLowerCase()).not.toContain("limit 1 by");
    expect(sql.toLowerCase()).not.toContain(" final");
  });

  it("does not rewrite a JOIN (extent: single-table floor families)", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core as e")
        .innerJoin("traces as t", (join) =>
          join.onRef("e.trace_id", "=", "t.id"),
        )
        .select("e.span_id"),
    );
    expect(sql.toLowerCase()).not.toContain("limit 1 by");
  });

  it("lowers a CTE body independently of the outer query", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .with("rows", (qb) =>
          qb.selectFrom("events_core").select(["span_id", "project_id"]),
        )
        .selectFrom("rows")
        .select("span_id"),
    );
    const lower = sql.toLowerCase();
    expect(lower).toMatch(/with rows as/);
    expect(lower).toMatch(/limit 1 by span_id, project_id/);
    // Outer FROM is the CTE name, not events_core — no second LIMIT BY.
    expect(lower.split("limit 1 by").length - 1).toBe(1);
  });
});

describe("typed params from the column registry", () => {
  it("binds an integer compared to total_cost as Float64, not Int64", () => {
    const { sql, params } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .where("total_cost", ">", 1)
        .distinct(),
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
        .where("total_cost", "in", [1, 2])
        .distinct(),
    );
    expect(sql).toMatch(/total_cost in \(\{p\d+:Array\(Float64\)\}\)/);
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
