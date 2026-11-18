import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { getClickhouseKysely } from "./dialect";
import { QueryCompileError } from "./errors";
import { applyPassOnly } from "./passHarness";
import { SchemaReferencePlugin } from "./schemaReferences";

// The schema reference pass alone: a three-part column reference is rejected
// wherever a select can hold it, and a query without one passes unchanged.

const db = getClickhouseKysely();
const threePart = sql.ref<string>("t.id.x");

/** `select t.id as x from traces as t`, or that select holding `t.id.x`. */
const tracesRead = () => db.selectFrom("traces as t").select("t.id as x");
const holdingThreePart = () =>
  db.selectFrom("traces as t").select(threePart.as("x"));

describe("schema reference pass alone", () => {
  it.each([
    ["the select list", holdingThreePart()],
    ["WHERE", tracesRead().where(threePart, "=", "v")],
    [
      "a JOIN ON",
      tracesRead().innerJoin("observations as o", (join) =>
        join.onRef("o.trace_id", "=", "t.id").on(threePart, "=", "v"),
      ),
    ],
    ["GROUP BY", tracesRead().groupBy(threePart)],
    ["HAVING", tracesRead().groupBy("t.id").having(threePart, "=", "v")],
    ["ORDER BY", tracesRead().orderBy(threePart)],
    [
      "a FROM subquery",
      db.selectFrom(holdingThreePart().as("s")).select("s.x"),
    ],
    ["an IN subquery", tracesRead().where("t.id", "in", holdingThreePart())],
    [
      "a CTE body",
      db
        .with("w", () => holdingThreePart())
        .selectFrom("w")
        .select("w.x"),
    ],
  ])("rejects a three-part reference in %s", (_position, query) => {
    expect(() => applyPassOnly(query, new SchemaReferencePlugin())).toThrow(
      QueryCompileError,
    );
    expect(() => applyPassOnly(query, new SchemaReferencePlugin())).toThrow(
      `"t.id" qualifies a column with two parts`,
    );
  });

  it("leaves a query of two-part references unchanged", () => {
    const query = tracesRead().where(sql.ref("t.id"), "=", "v").orderBy("t.id");
    expect(applyPassOnly(query, new SchemaReferencePlugin())).toEqual(
      query.toOperationNode(),
    );
  });
});
