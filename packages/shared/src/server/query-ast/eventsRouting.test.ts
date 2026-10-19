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
  limitBy,
  mapValue,
  metadataMap,
  metadataValue,
  startsWith,
  useFinal,
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

  it("rejects select * and select e.*, but not count(*)", () => {
    expect(() => compile(db.selectFrom("events").selectAll())).toThrow(
      QueryCompileError,
    );
    expect(() => compile(db.selectFrom("events as e").selectAll("e"))).toThrow(
      QueryCompileError,
    );
    expect(
      routedTables(
        compile(
          db.selectFrom("events as e").select((eb) => eb.fn.countAll().as("n")),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("routes count(*) with a clause on a truncated column to events_full", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as e")
            .select((eb) =>
              eb.fn.countAll().filterWhere("e.input", "=", "x").as("n"),
            ),
        ),
      ),
    ).toEqual(["events_full"]);
    expect(
      routedTables(
        compile(
          db.selectFrom("events as e").select((eb) =>
            eb.fn
              .countAll()
              .over((ob) => ob.partitionBy("e.input"))
              .as("n"),
          ),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it("keeps count(*) with a clause on an untruncated column on events_core", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as e")
            .select((eb) =>
              eb.fn.countAll().filterWhere("e.name", "=", "x").as("n"),
            ),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("ignores an alias named like a truncated column", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as e")
            .select((eb) => eb.fn.count("e.span_id").as("input")),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it.each([
    ["lengthUTF8(e.output)", sql<string>`lengthUTF8(e.output)`],
    ["sql.id e.input", sql<string>`${sql.id("e", "input")}`],
    ["sql.id input", sql<string>`${sql.id("input")}`],
    ["sql.table input", sql<string>`${sql.table("input")}`],
    ["*", sql<string>`*`],
    ["e.*", sql.raw<string>("e.*")],
    ["tuple(*)", sql<string>`tuple(*)`],
    ["COLUMNS(...)", sql<string>`COLUMNS('^inp')`],
    ["sql.ref e.*", sql.ref<string>("e.*")],
    ["sql.ref *", sql.ref<string>("*")],
    ["tuple(sql.ref e.*)", sql<string>`tuple(${sql.ref("e.*")})`],
  ])("rejects raw %s in a select that reads events", (_, expression) => {
    expect(() =>
      compile(db.selectFrom("events as e").select(expression.as("x"))),
    ).toThrow(QueryCompileError);
  });

  it("rejects a raw identifier in the where clause of a select that reads events", () => {
    expect(() =>
      compile(
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where(sql<string>`${sql.id("input")}`, "=", "x"),
      ),
    ).toThrow(QueryCompileError);
  });

  it("rejects raw SQL in a select nested under one that reads events", () => {
    expect(() =>
      compile(
        db.selectFrom("events as e").select((eb) => [
          "e.span_id",
          eb
            .selectFrom("scores as s")
            .select(sql<number>`1`.as("one"))
            .limit(1)
            .as("x"),
        ]),
      ),
    ).toThrow(QueryCompileError);
    // The subquery's e.input resolves to the outer events relation.
    expect(() =>
      compile(
        db.selectFrom("events as e").select((eb) => [
          "e.span_id",
          eb
            .selectFrom("scores as s")
            .select((sb) =>
              sb.fn<string>("tuple(e.input), length", [sb.val("x")]).as("t"),
            )
            .limit(1)
            .as("x"),
        ]),
      ),
    ).toThrow(QueryCompileError);
  });

  it("rejects COLUMNS() in a select that reads events", () => {
    expect(() =>
      compile(
        db
          .selectFrom("events as e")
          .select((eb) => eb.fn<string>("COLUMNS", [eb.val("^inp")]).as("x")),
      ),
    ).toThrow(QueryCompileError);
    expect(() =>
      compile(
        db
          .selectFrom("events as e")
          .select((eb) =>
            eb.fn.agg<string>("columns", [eb.val("^inp")]).as("x"),
          ),
      ),
    ).toThrow(QueryCompileError);
  });

  it.each(["columns ", "tuple(e.input), length"])(
    "rejects the function name %j in a select that reads events",
    (name) => {
      // A name reaches the SQL unchecked: ClickHouse reads "columns " as the
      // COLUMNS matcher, and the second name reads e.input itself.
      expect(() =>
        compile(
          db
            .selectFrom("events as e")
            .select((eb) => eb.fn<string>(name, [eb.val("^inp")]).as("x")),
        ),
      ).toThrow(QueryCompileError);
      expect(() =>
        compile(
          db
            .selectFrom("events as e")
            .select((eb) => eb.fn.agg<string>(name, [eb.val("^inp")]).as("x")),
        ),
      ).toThrow(QueryCompileError);
      expect(() =>
        compile(
          db
            .selectFrom("scores as s")
            .select((eb) => eb.fn<string>(name, [eb.val("^inp")]).as("x")),
        ),
      ).not.toThrow();
    },
  );

  it.each([
    "events_core.input",
    "default.events_core.input",
    "events_full.input",
  ])("rejects the physical qualifier %s over a logical relation", (ref) => {
    // ClickHouse resolves a qualifier by table name even when the table is aliased.
    expect(() =>
      compile(
        db.selectFrom("events as e").select(sql.ref<string>(ref).as("x")),
      ),
    ).toThrow(QueryCompileError);
  });

  it("keeps a physical events qualifier when no logical relation is in scope", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events_core as c")
            .$call(includeDeleted())
            .select(sql.ref<string>("events_core.input").as("x")),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("resolves sql.ref like a builder reference", () => {
    const route = (ref: string) =>
      routedTables(
        compile(
          db.selectFrom("events as e").select(sql.ref<string>(ref).as("x")),
        ),
      );
    expect(route("e.input")).toEqual(["events_full"]);
    expect(route("e.span_id")).toEqual(["events_core"]);
  });

  it("allows raw SQL in a select over a subquery that reads events", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom(
              db.selectFrom("events as e").select("e.span_id").as("x"),
            )
            .select(sql<number>`1`.as("one")),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("routes an unqualified truncated column of the only relation", () => {
    expect(
      routedTables(compile(db.selectFrom("events").select("input"))),
    ).toEqual(["events_full"]);
  });

  it("routes a table-qualified read of an unaliased logical relation", () => {
    expect(
      routedTables(compile(db.selectFrom("events").select("events.input"))),
    ).toEqual(["events_full"]);
  });

  it("routes an unqualified limit by column of the only relation", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events")
            .select("span_id")
            .$call(limitBy({ count: 1, columns: ["input"] })),
        ),
      ),
    ).toEqual(["events_full"]);
    expect(() =>
      compile(
        db
          .selectFrom("events")
          .select("span_id")
          .$call(limitBy({ count: 1, columns: ["*"] })),
      ),
    ).toThrow(QueryCompileError);
  });

  it("rejects an unqualified truncated column in a subquery under a select that reads events", () => {
    expect(() =>
      compile(
        db
          .selectFrom("events as e")
          .select((eb) => [
            "e.span_id",
            eb
              .selectFrom("scores as s")
              .select(sql.ref<string>("input").as("i"))
              .limit(1)
              .as("x"),
          ]),
      ),
    ).toThrow(QueryCompileError);
  });

  it("rejects an unqualified truncated column in a subquery with no FROM under a select that reads events", () => {
    // ClickHouse resolves `input` in a no-FROM subquery to the outer relation.
    expect(() =>
      compile(
        db
          .selectFrom("events")
          .select([
            "span_id",
            db.selectNoFrom(sql.ref<string>("input").as("i")).as("x"),
          ]),
      ),
    ).toThrow(QueryCompileError);
  });

  it("resolves a qualifier to an inner FINAL relation before an outer one", () => {
    expect(
      routedTables(
        compile(
          db.selectFrom("events as s").select((eb) => [
            "s.span_id",
            eb
              .selectFrom("scores as s")
              .$call(useFinal(["scores"]))
              .select(sql.ref<string>("s.input").as("i"))
              .limit(1)
              .as("x"),
          ]),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("rejects an unqualified truncated column with two relations in scope", () => {
    expect(() =>
      compile(
        db
          .selectFrom("events as a")
          .innerJoin("events as b", "a.span_id", "b.span_id")
          .select(sql.ref<string>("input").as("x")),
      ),
    ).toThrow(QueryCompileError);
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

  it("routes each logical relation by its own reads", () => {
    // `e` in the CTE and `e` outside are different relations; `io.input`
    // reads the CTE.
    const query = db
      .with("io", (qb) =>
        qb.selectFrom("events as e").select(["e.span_id", "e.input"]),
      )
      .selectFrom("events as e")
      .innerJoin("io", "io.span_id", "e.span_id")
      .select(["e.span_id", "io.input"]);

    expect(routedTables(compile(query))).toEqual([
      "events_full",
      "events_core",
    ]);
  });

  it("routes joined logical relations separately", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as a")
            .innerJoin("events as b", "a.span_id", "b.span_id")
            .select(["a.span_id", "b.input"]),
        ),
      ),
    ).toEqual(["events_core", "events_full"]);
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

  it("keeps a short `=` on events_core under a plugin that rewrites the select", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as e")
            .select("e.span_id")
            .where((eb) => eb(metadataValue("e", "k"), "=", "x"))
            .$call(limitBy({ count: 1, columns: ["e.span_id"] })),
        ),
      ),
    ).toEqual(["events_core"]);
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

  it("routes the relation whose values a hand-built metadata map reads", () => {
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
      "events_core",
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

  // Only `=` and `starts with` route by value length; the others always read
  // events_full, so one value each covers them.
  const lengthSensitive: MetadataOperator[] = ["=", "starts with"];
  const lengthInsensitive: MetadataOperator[] = [
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

  const cases = [
    ...lengthSensitive.flatMap((operator) =>
      values.map(({ label, value }) => ({ operator, label, value })),
    ),
    ...lengthInsensitive.map((operator) => ({
      operator,
      label: "short",
      value: "a",
    })),
  ];

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
