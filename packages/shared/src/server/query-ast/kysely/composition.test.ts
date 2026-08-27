import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { mapKeys, mapValues, withArrayJoin, withLimitBy } from "./extensions";
import { defineView, fromView } from "./views";

// Raw compiler output (no `clickhouse format` binary needed), so these run
// unconditionally in CI. The raw SQL is lowercase; match case-insensitively.
const ctx = { projectId: "p" };

const arrayJoinItems = [
  { expression: mapKeys("cost_details"), as: "cost_key" },
  { expression: mapValues("cost_details"), as: "cost" },
];

describe("ARRAY JOIN composition across nesting positions", () => {
  it("emits ARRAY JOIN at the top level (baseline)", () => {
    const db = getClickhouseKysely();
    const qb = withArrayJoin(
      db.selectFrom("observations").select("environment"),
      arrayJoinItems,
    );

    const { sql } = compileClickhouseQuery(qb, ctx);
    expect(sql).toMatch(/array join/i);
    expect(sql).toMatch(/mapkeys/i);
    expect(sql).toMatch(/mapvalues/i);
  });

  it("keeps ARRAY JOIN when applied inside a CTE body", () => {
    const db = getClickhouseKysely();
    const qb = db
      .with("aj", (qb) =>
        withArrayJoin(
          qb.selectFrom("observations").select("environment"),
          arrayJoinItems,
        ),
      )
      .selectFrom("aj")
      .select("environment");

    const { sql } = compileClickhouseQuery(qb, ctx);
    // The outer query has no ARRAY JOIN, so its presence proves the clause
    // survived being embedded as a CTE body rather than being dropped.
    expect(sql).toMatch(/array join/i);
    expect(sql).toMatch(/with aj as/i);
  });

  it("keeps ARRAY JOIN when applied inside a subquery", () => {
    const db = getClickhouseKysely();
    const qb = db
      .selectFrom(
        withArrayJoin(
          db.selectFrom("observations").select("environment"),
          arrayJoinItems,
        ).as("sub"),
      )
      .select("environment");

    const { sql } = compileClickhouseQuery(qb, ctx);
    // Outer query has no ARRAY JOIN; presence proves the subquery clause held.
    expect(sql).toMatch(/array join/i);
  });

  it("keeps ARRAY JOIN when applied inside a virtual-view body", () => {
    const db = getClickhouseKysely();
    const view = defineView("aj_view")<{ environment: string }>(() =>
      withArrayJoin(
        db.selectFrom("observations").select("environment"),
        arrayJoinItems,
      ),
    );

    const qb = fromView(view).select("environment");

    const { sql } = compileClickhouseQuery(qb, ctx);
    // Outer query only selects from the view alias; presence proves the view
    // body's ARRAY JOIN composed into the emitted CTE.
    expect(sql).toMatch(/array join/i);
    expect(sql).toMatch(/with aj_view as/i);
  });
});

describe("LIMIT BY composition across nesting positions", () => {
  it("emits LIMIT BY at the top level (baseline)", () => {
    const db = getClickhouseKysely();
    const qb = withLimitBy(
      db
        .selectFrom("events_core")
        .select(["span_id", "project_id"])
        .orderBy("event_ts", "desc"),
      { count: 1, columns: ["span_id", "project_id"] },
    );

    const { sql } = compileClickhouseQuery(qb, ctx);
    expect(sql).toMatch(/limit 1 by/i);
  });

  it("keeps LIMIT BY when applied inside a CTE body", () => {
    const db = getClickhouseKysely();
    const qb = db
      .with("lb", (qb) =>
        withLimitBy(
          qb
            .selectFrom("events_core")
            .select(["span_id", "project_id"])
            .orderBy("event_ts", "desc"),
          { count: 1, columns: ["span_id", "project_id"] },
        ),
      )
      .selectFrom("lb")
      .select("span_id");

    const { sql } = compileClickhouseQuery(qb, ctx);
    // Outer query has no LIMIT BY; presence proves the CTE body's clause held.
    expect(sql).toMatch(/limit 1 by/i);
    expect(sql).toMatch(/with lb as/i);
  });
});
