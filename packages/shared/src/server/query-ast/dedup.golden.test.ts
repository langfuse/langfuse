import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clickhouseLocalAvailable,
  executeClickhouseLocal,
  substituteNamedParams,
} from "../repositories/goldenHarness";
import type { ClickhouseCompilable } from "./compile";
import { DedupLoweringPlugin } from "./dedup";
import { getClickhouseKysely } from "./dialect";
import { count, limitBy } from "./extensions";
import { applyPassOnly, renderPassOutput } from "./passHarness";
import { DEDUP_SPECS } from "./schema";

// The dedup pass alone, on a table that declares `limitBy` dedup: every read
// shape it lowers sees one row per key, the latest version, so a stale
// version neither shows up nor counts twice. No registry table declares
// `limitBy` yet, so the suite declares it on `traces` for its duration.

const describeWithClickhouseLocal = clickhouseLocalAvailable()
  ? describe
  : describe.skip;

if (!clickhouseLocalAvailable()) {
  console.warn(
    "[dedup] `clickhouse local` unavailable — skipping row-level dedup checks.",
  );
}

// Trace `t1` has a stale version (`old`) and a latest one (`new`). Trace `t3`'s
// latest version (`old`) equals `t1`'s stale one, so a DISTINCT applied
// before the latest version is picked reads `t3`'s stale `x`.
const DEDUP_FIXTURE = `
  CREATE TABLE traces (
    id String,
    project_id String,
    environment String,
    event_ts DateTime64(3)
  ) ENGINE = Memory;
  INSERT INTO traces (id, project_id, environment, event_ts) VALUES
    ('t1', 'p', 'old', '2024-01-01 00:00:00'),
    ('t1', 'p', 'new', '2024-01-02 00:00:00'),
    ('t2', 'p', 'only', '2024-01-01 00:00:00'),
    ('t3', 'p', 'x', '2024-01-01 00:00:00'),
    ('t3', 'p', 'old', '2024-01-02 00:00:00');
`;

const db = getClickhouseKysely();

/** `select t.id, t.environment from traces as t`. */
const traceRows = () =>
  db.selectFrom("traces as t").select(["t.id", "t.environment"]);

/**
 * The rows `query` returns on the fixture after the dedup pass alone (or no
 * pass, for `lowered: false`), each tab-joined, sorted.
 */
function rowsOf(query: ClickhouseCompilable, lowered = true): string[] {
  const node = lowered
    ? applyPassOnly(query, new DedupLoweringPlugin())
    : query.toOperationNode();
  const { sql, params } = renderPassOutput(node);
  const output = executeClickhouseLocal(
    `${DEDUP_FIXTURE}\n${substituteNamedParams(sql, params)} FORMAT TSV`,
  );
  return output.split("\n").sort();
}

describeWithClickhouseLocal("dedup pass alone: one row per key", () => {
  beforeEach(() => {
    DEDUP_SPECS.traces = {
      strategy: "limitBy",
      key: ["id"],
      version: "event_ts",
    };
  });
  afterEach(() => {
    delete DEDUP_SPECS.traces;
  });

  it("reads the stale version without the pass", () => {
    expect(rowsOf(traceRows(), false)).toContain("t1\told");
  });

  it.each([
    ["a row read", traceRows()],
    [
      // Descending, the fixture's stale `old` row of t1 sorts before `new`.
      "a row read ordered by another column",
      traceRows().orderBy("t.environment", "desc"),
    ],
    [
      "a row read ordered by the version ascending",
      traceRows().orderBy("t.event_ts" as never, "asc"),
    ],
    [
      "a row read ordered by the version with no direction",
      traceRows().orderBy("t.event_ts" as never),
    ],
    [
      "a row read with the caller's LIMIT BY",
      traceRows().$call(
        limitBy({ count: 1, columns: (eb) => [eb.ref("t.id")] }),
      ),
    ],
  ])("keeps the latest version in %s", (_shape, query) => {
    expect(rowsOf(query)).toEqual(["t1\tnew", "t2\tonly", "t3\told"]);
  });

  it("keeps the caller's LIMIT BY on another column in place of key dedup", () => {
    // Known gap: `t3\tx` is t3's stale version. A caller LIMIT BY replaces the
    // key dedup, so the pass only sorts by version: one row per environment,
    // the latest written (`t3`'s `old` beats `t1`'s), stale or not.
    expect(
      rowsOf(
        traceRows().$call(
          limitBy({ count: 1, columns: (eb) => [eb.ref("t.environment")] }),
        ),
      ),
    ).toEqual(["t1\tnew", "t2\tonly", "t3\told", "t3\tx"]);
  });

  it.each([
    [
      "DISTINCT",
      traceRows().clearSelect().select("t.environment").distinct(),
      ["new", "old", "only"],
    ],
    [
      "GROUP BY",
      db
        .selectFrom("traces as t")
        .select(["t.environment", count().as("n")])
        .groupBy("t.environment"),
      ["new\t1", "old\t1", "only\t1"],
    ],
    ["a count", db.selectFrom("traces as t").select(count().as("n")), ["3"]],
    [
      "a count with LIMIT 10",
      db.selectFrom("traces as t").select(count().as("n")).limit(10),
      ["3"],
    ],
    [
      "a count beside another aggregate with LIMIT 1",
      db
        .selectFrom("traces as t")
        .select((eb) => [count().as("n"), eb.fn.max("t.id").as("m")])
        .limit(1),
      ["3\tt3"],
    ],
    [
      "a GROUP BY count with LIMIT 1",
      db
        .selectFrom("traces as t")
        .select(count().as("n"))
        .groupBy("t.id")
        .orderBy("n", "desc")
        .limit(1),
      ["1"],
    ],
    [
      "a GROUP BY with max",
      db
        .selectFrom("traces as t")
        .select((eb) => ["t.id", eb.fn.max("t.environment").as("m")])
        .groupBy("t.id"),
      ["t1\tnew", "t2\tonly", "t3\told"],
    ],
    [
      "a HAVING",
      db
        .selectFrom("traces as t")
        .select((eb) => eb.fn.max("t.environment").as("m"))
        .having((eb) => eb(eb.fn.max("t.environment"), "!=", "")),
      ["only"],
    ],
    [
      "a WHERE",
      db
        .selectFrom("traces as t")
        .select(count().as("n"))
        .where("t.id", "!=", "t2"),
      ["2"],
    ],
    [
      "a sum",
      db
        .selectFrom("traces as t")
        .select((eb) =>
          eb.fn.sum(eb.fn<number>("length", ["t.environment"])).as("n"),
        ),
      ["10"],
    ],
    [
      "an upper-case SUM",
      db
        .selectFrom("traces as t")
        .select((eb) =>
          eb.fn
            .agg<number>("SUM", [eb.fn("length", ["t.environment"])])
            .as("n"),
        ),
      ["10"],
    ],
    [
      "an avg",
      db
        .selectFrom("traces as t")
        .select((eb) =>
          eb
            .fn<number>("round", [
              eb.fn.avg(eb.fn<number>("length", ["t.environment"])),
              eb.lit(2),
            ])
            .as("n"),
        ),
      ["3.33"],
    ],
    [
      // Known gap: a scalar max() is not lowered, so on this fixture it reads
      // t3's stale `x`. Its OVER makes it read every row, so the pass lowers
      // it.
      "a window aggregate",
      db
        .selectFrom("traces as t")
        .select((eb) => eb.fn.max("t.environment").over().as("m")),
      ["only", "only", "only"],
    ],
  ])("aggregates the latest versions under %s", (_shape, query, rows) => {
    expect(rowsOf(query)).toEqual(rows);
  });

  it.each([
    [
      "a FROM subquery",
      db.selectFrom(traceRows().as("s")).select(["s.id", "s.environment"]),
    ],
    [
      "a CTE body",
      db
        .with("w", () => traceRows())
        .selectFrom("w")
        .select(["w.id", "w.environment"]),
    ],
  ])("keeps the latest version of a read in %s", (_position, query) => {
    expect(rowsOf(query)).toEqual(["t1\tnew", "t2\tonly", "t3\told"]);
  });
});
