import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { limitBy } from "./extensions";
import { DEDUP_SPECS } from "./schema";

const projectId = "proj-1";

function compile(builder: Parameters<typeof compileClickhouseQuery>[0]) {
  return compileClickhouseQuery(builder, projectId);
}

describe("per-table dedup lowering", () => {
  it("declares events_core as immutable (no query-time collapse)", () => {
    expect(DEDUP_SPECS.events_core).toEqual({ strategy: "none" });
    expect(DEDUP_SPECS.traces).toBeUndefined();
    expect(DEDUP_SPECS.observations).toBeUndefined();
    expect(DEDUP_SPECS.scores).toBeUndefined();
  });

  it("does not inject LIMIT BY or FINAL on events_core row reads", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select(["span_id", "project_id"]),
    );
    const lower = sql.toLowerCase();
    expect(lower).not.toContain("limit 1 by");
    expect(lower).not.toMatch(/\bfinal\b/);
  });

  it("does not wrap events_core DISTINCT", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("environment")
        .distinct(),
    );
    const lower = sql.toLowerCase();
    expect(lower).not.toContain("limit 1 by");
    expect(lower).not.toContain("from (select *");
  });

  it("does not wrap events_core aggregations", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select((eb) => ["environment", eb.fn.countAll().as("n")])
        .groupBy("environment"),
    );
    const lower = sql.toLowerCase();
    expect(lower).not.toContain("limit 1 by");
    expect(lower).not.toContain("from (select *");
    expect(lower).toContain("group by environment");
  });

  it("still emits an explicit caller LIMIT BY", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events_core")
        .select("span_id")
        .orderBy("event_ts", "desc")
        .$call(limitBy({ count: 1, columns: ["span_id", "project_id"] })),
    );
    expect(sql.toLowerCase().split("limit 1 by").length - 1).toBe(1);
  });

  it("lowers a physical read but not a nested read of an outer CTE of that name", () => {
    DEDUP_SPECS.traces = {
      strategy: "limitBy",
      key: ["id"],
      version: "event_ts",
    };
    try {
      const db = getClickhouseKysely();
      const { sql } = compile(
        db
          .with("traces", (qb) =>
            qb.selectFrom("scores").select("trace_id as id"),
          )
          .selectFrom("scores as s")
          .select("s.id")
          .where("s.trace_id", "in", (eb) =>
            eb.selectFrom("traces").select("id"),
          )
          .where(
            "s.trace_id",
            "in",
            db.withSchema("default").selectFrom("traces").select("id"),
          ),
      );
      expect(sql).toBe(
        "with traces as (select trace_id as id from scores where project_id = {p1:String}) select s.id from scores as s where s.project_id = {p1:String} and s.trace_id in (select id from traces) and s.trace_id in (select id from default.traces where project_id = {p1:String} order by event_ts desc limit 1 by id)",
      );
    } finally {
      delete DEDUP_SPECS.traces;
    }
  });

  it("does not rewrite undeclared tables", () => {
    const { sql } = compile(
      getClickhouseKysely().selectFrom("traces").select("id"),
    );
    expect(sql.toLowerCase()).not.toContain("limit 1 by");
    expect(sql.toLowerCase()).not.toMatch(/\bfinal\b/);
  });
});
