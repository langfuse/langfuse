import {
  sql,
  type Expression,
  type ExpressionBuilder,
  type SqlBool,
} from "kysely";
import { describe, expect, it } from "vitest";

import {
  FilterList,
  filtersRequireEventsFull,
  StringFilter,
  StringObjectFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { compileClickhouseQuery } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError } from "./errors";
import {
  includeDeleted,
  mapValue,
  metadataMap,
  metadataValue,
  startsWith,
} from "./extensions";
import type { ClickHouseDatabase } from "./schema";

// Raw compiler output, so these run without a `clickhouse` binary.
const projectId = "p";

function compile(builder: Parameters<typeof compileClickhouseQuery>[0]) {
  return compileClickhouseQuery(builder, projectId).sql;
}

/** Physical events tables in FROM/JOIN position, in order. */
function routedTables(query: string): string[] {
  return [
    ...query.matchAll(/\b(?:from|join) (events_core|events_full)\b/g),
  ].map((match) => match[1]);
}

const db = getClickhouseKysely();

type EventsEb = ExpressionBuilder<
  ClickHouseDatabase & { e: ClickHouseDatabase["events"] },
  "e"
>;

describe("logical events routing", () => {
  it("routes a read of untruncated columns to events_core", () => {
    expect(
      compile(
        db
          .selectFrom("events as e")
          .select(["e.span_id", "e.name"])
          .where("e.trace_id", "=", "t"),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id, e.name from events_core as e where e.project_id = {p1:String} and e.is_deleted = {p2:UInt8} and e.trace_id = {p3:String}"`,
    );
  });

  it.each([
    "input",
    "output",
    "metadata_values",
    "input_length",
    "output_length",
  ] as const)("routes a projection of %s to events_full", (column) => {
    expect(
      routedTables(compile(db.selectFrom("events as e").select(`e.${column}`))),
    ).toEqual(["events_full"]);
  });

  it("routes a projected metadata value to events_full", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as e")
            .select(() => [metadataValue("e", "k").as("v")]),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it("routes select * and select e.* to events_full, but not count(*)", () => {
    expect(routedTables(compile(db.selectFrom("events").selectAll()))).toEqual([
      "events_full",
    ]);
    expect(
      routedTables(compile(db.selectFrom("events as e").selectAll("e"))),
    ).toEqual(["events_full"]);
    expect(
      routedTables(
        compile(
          db.selectFrom("events as e").select((eb) => eb.fn.countAll().as("n")),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("routes a raw fragment that names a truncated column to events_full", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as e")
            .select(sql<number>`lengthUTF8(e.output)`.as("n")),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it("routes a raw identifier that names a truncated column to events_full", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as e")
            .select(sql<string>`${sql.id("e", "input")}`.as("x")),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it.each([
    ["*", sql<string>`*`],
    ["e.*", sql.raw<string>("e.*")],
    ["tuple(*)", sql<string>`tuple(*)`],
    ["COLUMNS(...)", sql<string>`COLUMNS('^inp')`],
  ])("routes a raw %s to events_full", (_, expression) => {
    expect(
      routedTables(
        compile(db.selectFrom("events as e").select(expression.as("x"))),
      ),
    ).toEqual(["events_full"]);
  });

  it("keeps an unaliased logical read addressable by its name", () => {
    expect(
      compile(
        db
          .selectFrom("events")
          .select("events.span_id")
          .where("span_id", "=", "s"),
      ),
    ).toMatchInlineSnapshot(
      `"select events.span_id from events_core as events where events.project_id = {p1:String} and events.is_deleted = {p2:UInt8} and span_id = {p3:String}"`,
    );
  });

  it("routes a joined logical relation", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("scores as s")
            .innerJoin("events as e", (join) =>
              join.onRef("e.trace_id", "=", "s.trace_id"),
            )
            .select(["s.id", "e.input"]),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it("routes every logical relation in the query to one table", () => {
    // Only the CTE reads `input`, yet both relations go to events_full.
    const query = db
      .with("io", (qb) =>
        qb.selectFrom("events as e").select(["e.span_id", "e.input"]),
      )
      .selectFrom("events as e")
      .innerJoin("io", "io.span_id", "e.span_id")
      .select(["e.span_id", "io.input"]);

    expect(routedTables(compile(query))).toEqual([
      "events_full",
      "events_full",
    ]);
  });

  it("leaves physical events tables unchanged", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events_core as e")
            .$call(includeDeleted())
            .select("e.input"),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("rejects a CTE named events", () => {
    expect(() =>
      compile(
        db
          .with("events", (qb) =>
            qb.selectFrom("events_core").select("span_id"),
          )
          .selectFrom("events")
          .select("span_id"),
      ),
    ).toThrow(QueryCompileError);
  });
});

describe("logical events routing of metadata predicates", () => {
  const route = (predicate: (eb: EventsEb) => Expression<SqlBool>) =>
    routedTables(
      compile(
        db.selectFrom("events as e").select("e.span_id").where(predicate),
      ),
    );

  it("keeps a short `=` and `startsWith` on events_core", () => {
    expect(route((eb) => eb(metadataValue("e", "k"), "=", "x"))).toEqual([
      "events_core",
    ]);
    expect(route(() => startsWith(metadataValue("e", "k"), "x"))).toEqual([
      "events_core",
    ]);
  });

  it("keeps a negated short `=` on events_core", () => {
    expect(
      route((eb) => eb.not(eb(metadataValue("e", "k"), "=", "x"))),
    ).toEqual(["events_core"]);
  });

  it("routes other comparison shapes on a metadata value to events_full", () => {
    // Operator outside the allow-list.
    expect(route((eb) => eb(metadataValue("e", "k"), "!=", "x"))).toEqual([
      "events_full",
    ]);
    // Value on the left.
    expect(
      route((eb) => eb(eb.val("x"), "=", metadataValue("e", "k"))),
    ).toEqual(["events_full"]);
    // Compared to a column, not a bound value.
    expect(
      route((eb) => eb(metadataValue("e", "k"), "=", eb.ref("e.name"))),
    ).toEqual(["events_full"]);
  });

  it("routes a metadata map built from two relations to events_full", () => {
    const query = db
      .selectFrom("events as a")
      .innerJoin("events as b", "a.span_id", "b.span_id")
      .select("a.span_id")
      .where((eb) =>
        eb(
          mapValue(
            metadataMap(
              eb.ref("a.metadata_names"),
              eb.ref("b.metadata_values"),
            ),
            "k",
          ),
          "=",
          "x",
        ),
      );

    expect(routedTables(compile(query))).toEqual([
      "events_full",
      "events_full",
    ]);
  });
});

// The raw-SQL builders route through `filtersRequireEventsFull`; the logical
// relation must pick the same table for the same filter.
describe("logical events routing agrees with filtersRequireEventsFull", () => {
  type MetadataOperator =
    | "="
    | "starts with"
    | "contains"
    | "ends with"
    | "does not contain";

  const astPredicate = (operator: MetadataOperator, value: string) => {
    const metadata = metadataValue("e", "k");
    return (eb: EventsEb): Expression<SqlBool> => {
      switch (operator) {
        case "=":
          return eb(metadata, "=", value);
        case "starts with":
          return startsWith(metadata, value);
        case "contains":
          return eb(metadata, "like", `%${value}%`);
        case "ends with":
          return eb(metadata, "like", `%${value}`);
        case "does not contain":
          return eb(metadata, "not like", `%${value}%`);
      }
    };
  };

  const operators: MetadataOperator[] = [
    "=",
    "starts with",
    "contains",
    "ends with",
    "does not contain",
  ];
  // "😀" is one code point and two UTF-16 units, so these cases fail if
  // either side counts UTF-16 units instead of code points.
  const values = [199, 200, 201].flatMap((length) => [
    { label: `${length} ascii`, value: "a".repeat(length) },
    { label: `${length} astral`, value: "😀".repeat(length) },
  ]);

  const cases = operators.flatMap((operator) =>
    values.map(({ label, value }) => ({ operator, label, value })),
  );

  it.each(cases)("metadata $operator, $label", ({ operator, value }) => {
    const legacyNeedsFull = filtersRequireEventsFull(
      new FilterList([
        new StringObjectFilter({
          clickhouseTable: "events_core",
          field: "metadata",
          key: "k",
          operator,
          value,
          tablePrefix: "e",
        }),
      ]),
    );
    const [routed] = routedTables(
      compile(
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where(astPredicate(operator, value)),
      ),
    );

    expect(routed).toBe(legacyNeedsFull ? "events_full" : "events_core");
  });

  it.each(["input", "output"] as const)("%s filter", (field) => {
    const legacyNeedsFull = filtersRequireEventsFull(
      new FilterList([
        new StringFilter({
          clickhouseTable: "events_core",
          field,
          operator: "=",
          value: "x",
          tablePrefix: "e",
        }),
      ]),
    );
    const [routed] = routedTables(
      compile(
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where(`e.${field}`, "=", "x"),
      ),
    );

    expect(legacyNeedsFull).toBe(true);
    expect(routed).toBe("events_full");
  });
});
