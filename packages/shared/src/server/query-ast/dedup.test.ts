import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { limitBy, useFinal } from "./extensions";
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
        .selectFrom("events")
        .select(["span_id", "project_id"]),
    );
    const lower = sql.toLowerCase();
    expect(lower).not.toContain("limit 1 by");
    expect(lower).not.toMatch(/\bfinal\b/);
  });

  it("does not wrap events_core DISTINCT", () => {
    const { sql } = compile(
      getClickhouseKysely()
        .selectFrom("events")
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
        .selectFrom("events")
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
        .selectFrom("events")
        .select("span_id")
        .orderBy("event_ts", "desc")
        .$call(
          limitBy({
            count: 1,
            columns: (eb) => [eb.ref("span_id"), eb.ref("project_id")],
          }),
        ),
    );
    expect(sql.toLowerCase().split("limit 1 by").length - 1).toBe(1);
  });

  it("qualifies the version sort and LIMIT BY key with the FROM alias", () => {
    DEDUP_SPECS.traces = {
      strategy: "limitBy",
      key: ["id"],
      version: "event_ts",
    };
    try {
      const { sql } = compile(
        getClickhouseKysely().selectFrom("traces as t").select("t.id"),
      );
      expect(sql).toBe(
        "select t.id from traces as t where t.project_id = {p1:String} order by t.event_ts desc limit 1 by t.id",
      );
    } finally {
      delete DEDUP_SPECS.traces;
    }
  });

  it("rejects a declared final strategy, which has no emitter", () => {
    DEDUP_SPECS.traces = { strategy: "final" };
    try {
      expect(() =>
        compile(getClickhouseKysely().selectFrom("traces").select("id")),
      ).toThrow(/Dedup strategy "final" is declared on traces/);
    } finally {
      delete DEDUP_SPECS.traces;
    }
  });

  it("keeps the FROM alias when it wraps an aggregate", () => {
    DEDUP_SPECS.scores = {
      strategy: "limitBy",
      key: ["id"],
      version: "event_ts",
    };
    try {
      const { sql } = compile(
        getClickhouseKysely()
          .selectFrom("scores as s")
          .select((eb) => eb.fn.countAll().as("n")),
      );
      expect(sql).toBe(
        "select count(*) as n from (select * from scores as s where s.project_id = {p1:String} order by s.event_ts desc limit 1 by s.id) as s",
      );
    } finally {
      delete DEDUP_SPECS.scores;
    }
  });

  it("rejects FINAL on a table that declares limitBy dedup", () => {
    // FINAL and LIMIT 1 BY both pick the latest version, and the aggregate
    // wrap would move the FROM item into a subquery, so the pair is refused.
    DEDUP_SPECS.scores = {
      strategy: "limitBy",
      key: ["id"],
      version: "event_ts",
    };
    try {
      expect(() =>
        compile(
          getClickhouseKysely()
            .selectFrom("scores as s")
            .$call(useFinal(["scores"]))
            .select((eb) => eb.fn.countAll().as("n")),
        ),
      ).toThrow(/FINAL cannot be combined with the limitBy dedup/);
    } finally {
      delete DEDUP_SPECS.scores;
    }
  });

  it("does not count an aggregate inside a scalar subquery as the outer select's", () => {
    // `count(*)` belongs to the subquery, so the outer read keeps row dedup.
    DEDUP_SPECS.traces = {
      strategy: "limitBy",
      key: ["id"],
      version: "event_ts",
    };
    try {
      const { sql } = compile(
        getClickhouseKysely()
          .selectFrom("traces as t")
          .select((eb) => [
            "t.id",
            eb
              .selectFrom("scores as s")
              .select((inner) => inner.fn.countAll().as("n"))
              .as("n"),
          ]),
      );
      expect(sql).toMatch(/order by t\.event_ts desc limit 1 by t\.id$/);
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
