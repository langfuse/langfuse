import {
  AliasNode,
  FromNode,
  SelectQueryNode,
  type Kysely,
  sql,
  type Expression,
  type ExpressionBuilder,
  type KyselyPlugin,
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
  limitBy,
  mapValue,
  metadataMap,
  metadataValue,
  startsWith,
  useFinal,
} from "./extensions";
import { finalTable } from "./nodes";
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

/** The compile DB without its table types, to reach names the types forbid. */
const untypedDb = db as unknown as Kysely<
  Record<string, Record<string, string>>
>;

type EventsEb = ExpressionBuilder<
  ClickHouseDatabase & { e: ClickHouseDatabase["events"] },
  "e"
>;

const eventsMetadata = (eb: EventsEb, key: string) =>
  metadataValue(eb.ref("e.metadata_names"), eb.ref("e.metadata_values"), key);

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
      `"select e.span_id, e.name from events_core as e where e.project_id = {p1:String} and e.is_deleted = 0 and e.trace_id = {p2:String}"`,
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
            .select((eb) => [eventsMetadata(eb, "k").as("v")]),
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

  it("rejects FINAL around the logical relation", () => {
    // useFinal() refuses `events` (dedup: none), so FINAL is wrapped by hand;
    // routing would otherwise swap the table and drop the FINAL silently.
    const wrapFinal: KyselyPlugin = {
      transformQuery(args) {
        const node = args.node;
        if (!SelectQueryNode.is(node) || !node.from) return node;
        const [from] = node.from.froms;
        if (!AliasNode.is(from)) return node;
        return { ...node, from: FromNode.create([finalTable(from)]) };
      },
      async transformResult(args) {
        return args.result;
      },
    };
    expect(() =>
      compile(
        db.withPlugin(wrapFinal).selectFrom("events as e").select("e.span_id"),
      ),
    ).toThrow(/FINAL cannot wrap the logical "events" relation/);
  });

  it.each<[string, () => Parameters<typeof compile>[0]]>([
    ["FROM", () => untypedDb.selectFrom("events_core").select("span_id")],
    [
      "JOIN",
      () =>
        untypedDb
          .selectFrom("scores as s")
          .innerJoin("events_full as f", "f.span_id", "s.id")
          .select("s.id"),
    ],
    [
      "alias",
      () => untypedDb.selectFrom("events as events_core").select("span_id"),
    ],
    [
      // ClickHouse resolves a qualifier by table name even when the table is aliased.
      "column qualifier",
      () =>
        db
          .selectFrom("scores as s")
          .select(sql.ref<string>("events_core.input").as("x")),
    ],
    [
      "qualifier in a core-safe metadata predicate",
      () =>
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where((eb) =>
            eb(
              metadataValue(
                eb.ref("events_full.metadata_names" as never),
                eb.ref("events_full.metadata_values" as never),
                "k",
              ),
              "=",
              "x",
            ),
          ),
    ],
    [
      "raw SQL text",
      () =>
        db
          .selectFrom("scores as s")
          .select(sql<number>`(select count() from events_full)`.as("n")),
    ],
    [
      "sql.table",
      () =>
        db
          .selectFrom("scores as s")
          .select(sql<string>`${sql.table("events_core")}.input`.as("x")),
    ],
  ])("rejects a physical events table named as %s", (_, build) => {
    expect(() => compile(build())).toThrow(
      /Read the logical "events" relation instead of "events_(core|full)"/,
    );
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

  it("rejects an unqualified truncated column of the only relation", () => {
    expect(() => compile(db.selectFrom("events").select("input"))).toThrow(
      QueryCompileError,
    );
  });

  it("routes a table-qualified read of an unaliased logical relation", () => {
    expect(
      routedTables(compile(db.selectFrom("events").select("events.input"))),
    ).toEqual(["events_full"]);
  });

  it("rejects an unqualified limit by column of the only relation", () => {
    expect(() =>
      compile(
        db
          .selectFrom("events")
          .select("span_id")
          .$call(limitBy({ count: 1, columns: (eb) => [eb.ref("input")] })),
      ),
    ).toThrow(QueryCompileError);
    expect(() =>
      compile(
        db
          .selectFrom("events")
          .select("span_id")
          .$call(limitBy({ count: 1, columns: () => [sql.ref("*")] })),
      ),
    ).toThrow(QueryCompileError);
  });

  it("routes each use of a shared builder by its own reads", () => {
    // Both CTEs hold the same FROM node.
    const base = db.selectFrom("events as e");
    expect(
      routedTables(
        compile(
          db
            .with("a", () => base.select(["e.span_id", "e.input"]))
            .with("b", () => base.select(["e.span_id"]))
            .selectFrom("a")
            .innerJoin("b", "a.span_id", "b.span_id")
            .select("a.span_id"),
        ),
      ),
    ).toEqual(["events_full", "events_core"]);
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
      `"select events.span_id from events_core as events where events.project_id = {p1:String} and events.is_deleted = 0 and span_id = {p2:String}"`,
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

  it("routes events_truncated to events_core, also when it reads a truncated column", () => {
    expect(
      compile(
        db
          .selectFrom("events_truncated as e")
          .select(["e.span_id", "e.input"])
          .where((eb) => eb(eventsMetadata(eb, "k"), "!=", "x")),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id, e.input from events_core as e where e.project_id = {p1:String} and e.is_deleted = 0 and mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values))[{p2:String}] != {p3:String}"`,
    );
  });

  it("keeps an unaliased events_truncated name as the alias", () => {
    expect(
      compile(db.selectFrom("events_truncated").select("input")),
    ).toMatchInlineSnapshot(
      `"select input from events_core as events_truncated where events_truncated.project_id = {p1:String} and events_truncated.is_deleted = 0"`,
    );
  });

  it("routes events and events_truncated in one query separately", () => {
    expect(
      routedTables(
        compile(
          db
            .selectFrom("events as a")
            .innerJoin("events_truncated as b", "a.span_id", "b.span_id")
            .select(["a.input", "b.output"]),
        ),
      ),
    ).toEqual(["events_full", "events_core"]);
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
    expect(route((eb) => eb(eventsMetadata(eb, "k"), "=", "x"))).toEqual([
      "events_core",
    ]);
    expect(route((eb) => startsWith(eventsMetadata(eb, "k"), "x"))).toEqual([
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
            .where((eb) => eb(eventsMetadata(eb, "k"), "=", "x"))
            .$call(
              limitBy({ count: 1, columns: (eb) => [eb.ref("e.span_id")] }),
            ),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("keeps a negated short `=` on events_core", () => {
    expect(
      route((eb) => eb.not(eb(eventsMetadata(eb, "k"), "=", "x"))),
    ).toEqual(["events_core"]);
  });

  it("routes other comparison shapes on a metadata value to events_full", () => {
    // Operator outside the allow-list.
    expect(route((eb) => eb(eventsMetadata(eb, "k"), "!=", "x"))).toEqual([
      "events_full",
    ]);
    // Value on the left.
    expect(
      route((eb) => eb(eb.val("x"), "=", eventsMetadata(eb, "k"))),
    ).toEqual(["events_full"]);
    // Compared to a column, not a bound value.
    expect(
      route((eb) => eb(eventsMetadata(eb, "k"), "=", eb.ref("e.name"))),
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
    return (eb: EventsEb): Expression<SqlBool> => {
      const metadata = eventsMetadata(eb, "k");
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
