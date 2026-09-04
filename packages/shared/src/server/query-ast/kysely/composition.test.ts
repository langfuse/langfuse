import { describe, expect, it } from "vitest";

import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { arrayJoin, limitBy, mapKeys, mapValues } from "./extensions";
import { defineView, fromView } from "./views";

// Raw compiler output (no `clickhouse format` binary needed), so these run
// unconditionally in CI. The raw SQL is lowercase; match case-insensitively.
const ctx = { projectId: "p" };

const costArrayJoin = () =>
  arrayJoin({
    cost_key: mapKeys("cost_details"),
    cost: mapValues("cost_details"),
  });

const dedup = () => limitBy({ count: 1, columns: ["span_id", "project_id"] });

describe("ARRAY JOIN composition across nesting positions", () => {
  it("emits ARRAY JOIN at the top level (baseline)", () => {
    const db = getClickhouseKysely();
    const qb = db
      .selectFrom("observations")
      .select("environment")
      .$call(costArrayJoin());

    const { sql } = compileClickhouseQuery(qb, ctx);
    expect(sql).toMatch(/array join/i);
    expect(sql).toMatch(/mapkeys/i);
    expect(sql).toMatch(/mapvalues/i);
  });

  it("keeps ARRAY JOIN when applied inside a CTE body", () => {
    const db = getClickhouseKysely();
    const qb = db
      .with("aj", (qb) =>
        qb
          .selectFrom("observations")
          .select("environment")
          .$call(costArrayJoin()),
      )
      .selectFrom("aj")
      .select("environment");

    const { sql } = compileClickhouseQuery(qb, ctx);
    expect(sql).toMatch(/with aj as/i);
    // The ARRAY JOIN must live inside the CTE body and not leak into the outer
    // query. Split on the outer query (the `) select ... from aj` that closes
    // the CTE): the clause must appear before the split and be absent after it.
    const outerStart = sql.toLowerCase().search(/\)\s*select[\s\S]*from aj/i);
    expect(outerStart).toBeGreaterThan(-1);
    const cteBody = sql.slice(0, outerStart);
    const outerQuery = sql.slice(outerStart);
    expect(cteBody).toMatch(/array join/i);
    expect(outerQuery).not.toMatch(/array join/i);
  });

  it("keeps ARRAY JOIN when applied inside a subquery", () => {
    const db = getClickhouseKysely();
    const qb = db
      .selectFrom(
        db
          .selectFrom("observations")
          .select("environment")
          .$call(costArrayJoin())
          .as("sub"),
      )
      .select("environment");

    const { sql } = compileClickhouseQuery(qb, ctx);
    // Outer query has no ARRAY JOIN; presence proves the subquery clause held.
    expect(sql).toMatch(/array join/i);
  });

  it("keeps ARRAY JOIN when applied inside a virtual-view body", () => {
    const db = getClickhouseKysely();
    const view = defineView("aj_view")<{ environment: string }>(() =>
      db
        .selectFrom("observations")
        .select("environment")
        .$call(costArrayJoin()),
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
    const qb = db
      .selectFrom("events_core")
      .select(["span_id", "project_id"])
      .orderBy("event_ts", "desc")
      .$call(dedup());

    const { sql } = compileClickhouseQuery(qb, ctx);
    expect(sql).toMatch(/limit 1 by/i);
  });

  it("keeps LIMIT BY when applied inside a CTE body", () => {
    const db = getClickhouseKysely();
    const qb = db
      .with("lb", (qb) =>
        qb
          .selectFrom("events_core")
          .select(["span_id", "project_id"])
          .orderBy("event_ts", "desc")
          .$call(dedup()),
      )
      .selectFrom("lb")
      .select("span_id");

    const { sql } = compileClickhouseQuery(qb, ctx);
    // Outer query has no LIMIT BY; presence proves the CTE body's clause held.
    expect(sql).toMatch(/limit 1 by/i);
    expect(sql).toMatch(/with lb as/i);
  });
});
