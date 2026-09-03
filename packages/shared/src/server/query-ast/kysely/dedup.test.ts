import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { limitBy } from "./extensions";
import { DEDUP_SPECS } from "./schema";

const ctx = { projectId: "proj-1" };

function compile(builder: Parameters<typeof compileClickhouseQuery>[0]) {
  return compileClickhouseQuery(builder, ctx);
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
    expect(lower).toMatch(/group by environment/);
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

  it("does not rewrite undeclared tables", () => {
    const { sql } = compile(
      getClickhouseKysely().selectFrom("traces").select("id"),
    );
    expect(sql.toLowerCase()).not.toContain("limit 1 by");
    expect(sql.toLowerCase()).not.toMatch(/\bfinal\b/);
  });
});
