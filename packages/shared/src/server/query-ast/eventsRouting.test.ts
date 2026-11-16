import {
  AliasNode,
  FromNode,
  SelectQueryNode,
  type Kysely,
  sql,
  type AliasableExpression,
  type Expression,
  type ExpressionBuilder,
  type KyselyPlugin,
  type SqlBool,
} from "kysely";
import { describe, expect, it } from "vitest";

import { filterOperators } from "../../interfaces/filters";
import {
  FilterList,
  filtersRequireEventsFull,
  StringFilter,
  StringObjectFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { compileClickhouseQuery, type ClickhouseCompilable } from "./compile";
import { getClickhouseKysely } from "./dialect";
import { QueryCompileError } from "./errors";
import { EventsTableRoutingPlugin } from "./eventsRouting";
import {
  firstMetadataValue,
  ifElse,
  limitBy,
  literal,
  mapValue,
  metadataMap,
  metadataSubstringPrefilter,
  metadataTokenPrefilter,
  metadataValue,
  nullIf,
  startsWith,
  toFloat64OrNull,
  typedValue,
  useFinal,
} from "./extensions";
import { finalTable } from "./nodes";
import { applyPassOnly, renderPassOutput } from "./passHarness";
import type { ClickHouseDatabase } from "./schema";

// Raw compiler output, so these run without a `clickhouse` binary. The routing
// pass runs alone, so no other pass can hide a gap in it; `compile` runs every
// pass, for the tests of what the later passes do with a routed relation.
const projectId = "p";

/** SQL of `builder` after the routing pass alone. */
function routeAlone(builder: ClickhouseCompilable) {
  return renderPassOutput(
    applyPassOnly(builder, new EventsTableRoutingPlugin()),
  ).sql;
}

function compile(builder: ClickhouseCompilable) {
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
      routeAlone(
        db
          .selectFrom("events as e")
          .select(["e.span_id", "e.name"])
          .where("e.trace_id", "=", "t"),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id, e.name from events_core as e where e.trace_id = {p1:String}"`,
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
      routedTables(
        routeAlone(db.selectFrom("events as e").select(`e.${column}`)),
      ),
    ).toEqual(["events_full"]);
  });

  it("routes a projected metadata value to events_full", () => {
    expect(
      routedTables(
        routeAlone(
          db
            .selectFrom("events as e")
            .select((eb) => [eventsMetadata(eb, "k").as("v")]),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it("rejects select * and select e.*, but not count(*)", () => {
    expect(() => routeAlone(db.selectFrom("events").selectAll())).toThrow(
      QueryCompileError,
    );
    expect(() =>
      routeAlone(db.selectFrom("events as e").selectAll("e")),
    ).toThrow(QueryCompileError);
    expect(
      routedTables(
        routeAlone(
          db.selectFrom("events as e").select((eb) => eb.fn.countAll().as("n")),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  // `sql.ref` and a string `*` argument parse the star as a column named `*`.
  it.each<[string, () => ClickhouseCompilable]>([
    [
      "sql.ref('e.*')",
      () => db.selectFrom("events as e").select(sql.ref("e.*").as("x")),
    ],
    [
      "sql.ref('*')",
      () => db.selectFrom("events as e").select(sql.ref("*").as("x")),
    ],
    [
      "uniq('*')",
      () =>
        db
          .selectFrom("events as e")
          .select((eb) => eb.fn.agg("uniq", ["*" as never]).as("n")),
    ],
  ])("rejects a star column from %s", (_, build) => {
    expect(() => routeAlone(build())).toThrow(/cannot expand the logical/);
  });

  it("reads a truncated column whole on events_full", () => {
    expect(
      routeAlone(db.selectFrom("events as e").select("e.input")),
    ).toMatchInlineSnapshot(`"select e.input from events_full as e"`);
  });

  it("routes count(*) with a clause on a truncated column to events_full", () => {
    expect(
      routedTables(
        routeAlone(
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
        routeAlone(
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
        routeAlone(
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
        routeAlone(
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
      routeAlone(db.selectFrom("events as e").select(expression.as("x"))),
    ).toThrow(QueryCompileError);
  });

  it("rejects a raw identifier in the where clause of a select that reads events", () => {
    expect(() =>
      routeAlone(
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where(sql<string>`${sql.id("input")}`, "=", "x"),
      ),
    ).toThrow(QueryCompileError);
  });

  it("rejects raw SQL in a select nested under one that reads events", () => {
    expect(() =>
      routeAlone(
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
      routeAlone(
        db
          .selectFrom("events as e")
          .select((eb) => eb.fn<string>("COLUMNS", [eb.val("^inp")]).as("x")),
      ),
    ).toThrow(QueryCompileError);
    expect(() =>
      routeAlone(
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
      routeAlone(
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
      "qualifier in an emptiness check",
      () =>
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where((eb) =>
            eb(eb.ref("events_full.input" as never), "!=", "" as never),
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
      "sql.id",
      () =>
        db
          .selectFrom("scores as s")
          .select(sql<string>`${sql.id("events_full")}.input`.as("x")),
    ],
    [
      "sql.table",
      () =>
        db
          .selectFrom("scores as s")
          .select(sql<string>`${sql.table("events_core")}.input`.as("x")),
    ],
  ])("rejects a physical events table named as %s", (_, build) => {
    expect(() => routeAlone(build())).toThrow(
      /Read the logical "events" relation instead of "events_(core|full)"/,
    );
  });

  it("resolves sql.ref like a builder reference", () => {
    const route = (ref: string) =>
      routedTables(
        routeAlone(
          db.selectFrom("events as e").select(sql.ref<string>(ref).as("x")),
        ),
      );
    expect(route("e.input")).toEqual(["events_full"]);
    expect(route("e.span_id")).toEqual(["events_core"]);
  });

  it("allows raw SQL in a select over a subquery that reads events", () => {
    expect(
      routedTables(
        routeAlone(
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
    expect(() => routeAlone(db.selectFrom("events").select("input"))).toThrow(
      QueryCompileError,
    );
  });

  // `events_core` holds `leftUTF8(input, 200)`: empty exactly when the
  // `events_full` value is.
  it.each<[string, (eb: EventsEb) => Expression<SqlBool>]>([
    ["e.input = ''", (eb) => eb("e.input", "=", "")],
    ["e.output != ''", (eb) => eb("e.output", "!=", "")],
    ["e.input <> ''", (eb) => eb("e.input", "<>", "")],
    ["'' = e.output", (eb) => eb(eb.val(""), "=", eb.ref("e.output"))],
    ["unqualified input = ''", (eb) => eb("input", "=", "")],
    ["e.input is not null", (eb) => eb("e.input", "is not", null)],
    ["e.output is null", (eb) => eb("e.output", "is", null)],
    [
      "e.input = typed ''",
      (eb) => eb("e.input", "=", typedValue<string>("", "String")),
    ],
  ])("routes the emptiness check %s to events_core", (_, condition) => {
    expect(
      routedTables(
        routeAlone(
          db.selectFrom("events as e").select("e.span_id").where(condition),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("routes a truncated read in one conjunct of an AND to events_full", () => {
    expect(
      routedTables(
        routeAlone(
          db
            .selectFrom("events as e")
            .select("e.span_id")
            .where("e.trace_id", "=", "t")
            .where("e.input", "=", "x"),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it("routes a non-comparison of a truncated column with '' to events_full", () => {
    expect(
      routedTables(
        routeAlone(
          db
            .selectFrom("events as e")
            .select((eb) => eb("e.input", "||", "").as("x")),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  it("routes a table-qualified read of an unaliased logical relation", () => {
    expect(
      routedTables(routeAlone(db.selectFrom("events").select("events.input"))),
    ).toEqual(["events_full"]);
  });

  it("rejects an unqualified limit by column of the only relation", () => {
    expect(() =>
      routeAlone(
        db
          .selectFrom("events")
          .select("span_id")
          .$call(limitBy({ count: 1, columns: (eb) => [eb.ref("input")] })),
      ),
    ).toThrow(QueryCompileError);
    expect(() =>
      routeAlone(
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
        routeAlone(
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
      routeAlone(
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
      routeAlone(
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
        routeAlone(
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
      routeAlone(
        db
          .selectFrom("events as a")
          .innerJoin("events as b", "a.span_id", "b.span_id")
          .select(sql.ref<string>("input").as("x")),
      ),
    ).toThrow(QueryCompileError);
  });

  it("keeps an unaliased logical read addressable by its name", () => {
    // Every pass, so `events.project_id` below shows that a qualifier a later
    // pass adds resolves to the routed relation.
    expect(
      compile(
        db
          .selectFrom("events")
          .select("events.span_id")
          .where("span_id", "=", "s"),
      ),
    ).toMatchInlineSnapshot(
      `"select events.span_id from events_core as events where events.project_id = {p1:String} and span_id = {p2:String}"`,
    );
  });

  it("routes a joined logical relation", () => {
    expect(
      routedTables(
        routeAlone(
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

    expect(routedTables(routeAlone(query))).toEqual([
      "events_full",
      "events_core",
    ]);
  });

  it("routes joined logical relations separately", () => {
    expect(
      routedTables(
        routeAlone(
          db
            .selectFrom("events as a")
            .innerJoin("events as b", "a.span_id", "b.span_id")
            .select(["a.span_id", "b.input"]),
        ),
      ),
    ).toEqual(["events_core", "events_full"]);
  });

  it("keeps events_truncated on events_core when only its select reads a truncated column", () => {
    expect(
      routeAlone(
        db
          .selectFrom("events_truncated as e")
          .select(["e.span_id", "e.input"])
          .where((eb) => eb(eventsMetadata(eb, "k"), "=", "x")),
      ),
    ).toMatchInlineSnapshot(
      `"select e.span_id, e.input from events_core as e where mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values))[{p1:String}] = {p2:String}"`,
    );
  });

  it("routes events_truncated to events_full on a filter events_core cannot answer, and cuts what it selects", () => {
    expect(
      routeAlone(
        db
          .selectFrom("events_truncated as e")
          .select((eb) => [
            "e.input",
            "e.output_length",
            firstMetadataValue(
              eb.ref("e.metadata_names"),
              eb.ref("e.metadata_values"),
              eb.val("k"),
            ).as("k"),
          ])
          .where((eb) => eb(eventsMetadata(eb, "k"), "!=", "x"))
          .groupBy("e.input")
          .orderBy("e.input"),
      ),
    ).toMatchInlineSnapshot(
      `"select leftUTF8(e.input, 200) as input, lengthUTF8(leftUTF8(e.output, 200)) as output_length, arrayMap(v -> leftUTF8(v, 200), e.metadata_values)[indexOf(e.metadata_names, {p1:String})] as k from events_full as e where mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values))[{p1:String}] != {p2:String} group by leftUTF8(e.input, 200) order by leftUTF8(e.input, 200)"`,
    );
  });

  it("rejects a read of events_truncated it cannot cut once a filter routes it to events_full", () => {
    expect(() =>
      routeAlone(
        db
          .selectFrom("events_truncated as e")
          .selectAll("e")
          .where("e.input", "=", "x"),
      ),
    ).toThrow(/e\.\* cannot read "e"/);
    expect(() =>
      routeAlone(
        db
          .selectFrom("events_truncated as e")
          .select("input")
          .where("e.input", "=", "x"),
      ),
    ).toThrow(/Unqualified "input" cannot read "e"/);
  });

  // Only the select's own WHERE routes; transformWhere also sees FILTER's.
  it("keeps events_truncated on events_core when only an aggregate FILTER reads a truncated column", () => {
    const query = db
      .selectFrom("events_truncated as e")
      .select((eb) => eb.fn.countAll().filterWhere("e.input", "=", "x").as("n"))
      .where("e.span_id", "=", "s");
    expect(routedTables(routeAlone(query))).toEqual(["events_core"]);
  });

  it("rejects raw SQL text in the WHERE of a select that reads events_truncated", () => {
    expect(() =>
      routeAlone(
        db
          .selectFrom("events_truncated as e")
          .select("e.span_id")
          .where(sql<boolean>`e.input ilike '%x%'`),
      ),
    ).toThrow(
      /cannot appear in the WHERE of a select that reads "events_truncated"/,
    );
  });

  // The core-safe shortcut skips the walk only in a WHERE.
  it("cuts a core-safe metadata comparison outside the WHERE once events_truncated reads events_full", () => {
    expect(
      routeAlone(
        db
          .selectFrom("events_truncated as e")
          .select((eb) =>
            eb(toFloat64OrNull(eventsMetadata(eb, "k")), ">", 1).as("big"),
          )
          .where("e.output", "like", "%x%"),
      ),
    ).toMatchInlineSnapshot(
      `"select toFloat64OrNull(mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(arrayMap(v -> leftUTF8(v, 200), e.metadata_values)))[{p1:String}]) > {p2:Int64} as big from events_full as e where e.output like {p3:String}"`,
    );
  });

  it("cuts a vouched prefilter outside the WHERE once events_truncated reads events_full", () => {
    expect(
      routeAlone(
        db
          .selectFrom("events_truncated as e")
          .select((eb) =>
            eb
              .and([
                metadataTokenPrefilter(eb.ref("e.metadata_values"), "x", "="),
                eb(eventsMetadata(eb, "k"), "=", "x"),
              ])
              .as("hit"),
          )
          .where("e.output", "like", "%x%"),
      ),
    ).toMatchInlineSnapshot(
      `"select (hasAllTokens(arrayMap(v -> leftUTF8(v, 200), e.metadata_values), arraySlice(arrayDistinct(tokens({p1:String})), 1, 64)) and mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(arrayMap(v -> leftUTF8(v, 200), e.metadata_values)))[{p2:String}] = {p1:String}) as hit from events_full as e where e.output like {p3:String}"`,
    );
  });

  it.each<[string, () => Parameters<typeof compile>[0], RegExp]>([
    // resolveUnqualified: a copy in scope and the walk in its WHERE.
    [
      "an unqualified truncated column in its WHERE",
      () =>
        db
          .selectFrom("events_truncated as e")
          .select("e.span_id")
          .where("input", "=", "x"),
      /Qualify "input" in the WHERE/,
    ],
    // transformRaw: raw text outside the WHERE over a full copy.
    [
      "raw SQL text in its select once full",
      () =>
        db
          .selectFrom("events_truncated as e")
          .select(sql<string>`e.input`.as("i"))
          .where("e.output", "=", "x"),
      /Raw SQL text or identifiers cannot read "e"/,
    ],
    // rejectStar: a bare `*` over a full copy of the current select.
    [
      "selectAll() once full",
      () =>
        db
          .selectFrom("events_truncated as e")
          .selectAll()
          .where("e.output", "=", "x"),
      /^\* cannot read "e"/,
    ],
    // copiesInScope: the enclosing select's copy counts.
    [
      "raw SQL text in a subquery under a full copy",
      () =>
        db
          .selectFrom("events_truncated as e")
          .select((eb) =>
            eb
              .selectFrom("traces as t")
              .select(sql<string>`e.input`.as("i"))
              .limit(1)
              .as("i"),
          )
          .where("e.output", "=", "x"),
      /Raw SQL text or identifiers cannot read "e"/,
    ],
  ])("rejects %s of events_truncated", (_name, query, error) => {
    expect(() => routeAlone(query())).toThrow(error);
  });

  // transformWhere resets the flag: Kysely walks HAVING after WHERE.
  it("keeps events_truncated on events_core when only its HAVING reads a truncated column", () => {
    const query = db
      .selectFrom("events_truncated as e")
      .select("e.span_id")
      .where("e.span_id", "=", "s")
      .groupBy(["e.span_id", "e.input"])
      .having("e.input", "=", "x");
    expect(routedTables(routeAlone(query))).toEqual(["events_core"]);
  });

  // A core-safe condition in a select reads no truncated value of `events`.
  it.each<[string, (eb: EventsEb) => AliasableExpression<SqlBool>]>([
    ["a short metadata `=`", (eb) => eb(eventsMetadata(eb, "k"), "=", "x")],
    ["an unqualified emptiness check", (eb) => eb("input", "!=", "")],
  ])("keeps events on events_core for %s in its select", (_name, condition) => {
    expect(
      routedTables(
        routeAlone(
          db
            .selectFrom("events as e")
            .select((eb) => condition(eb).as("c"))
            .where("e.span_id", "=", "s"),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  it("keeps an unaliased events_truncated name as the alias", () => {
    expect(
      routeAlone(db.selectFrom("events_truncated").select("input")),
    ).toMatchInlineSnapshot(
      `"select input from events_core as events_truncated"`,
    );
  });

  it("routes events and events_truncated in one query separately", () => {
    expect(
      routedTables(
        routeAlone(
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
      routeAlone(
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
        routeAlone(
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
    // Looked up by a key read from a truncated column.
    expect(
      route((eb) =>
        eb(
          metadataValue(
            eb.ref("e.metadata_names"),
            eb.ref("e.metadata_values"),
            eb.ref("e.input"),
          ),
          "=",
          "x",
        ),
      ),
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

    expect(routedTables(routeAlone(query))).toEqual([
      "events_core",
      "events_full",
    ]);
  });

  const firstValue = (eb: EventsEb) =>
    firstMetadataValue(
      eb.ref("e.metadata_names"),
      eb.ref("e.metadata_values"),
      eb.val("k"),
    );
  const values = (eb: EventsEb) => eb.ref("e.metadata_values");

  it("keeps a short `=` and `startsWith` on the first entry on events_core", () => {
    expect(route((eb) => eb(firstValue(eb), "=", "x"))).toEqual([
      "events_core",
    ]);
    expect(route((eb) => startsWith(firstValue(eb), "x"))).toEqual([
      "events_core",
    ]);
  });

  it("keeps an IN of short values on events_core, one long value routes full", () => {
    const listed = (values: string[]) => (eb: EventsEb) =>
      eb(
        firstValue(eb),
        "in",
        eb.parens(typedValue<string>(values, "Array(String)")),
      );
    expect(route(listed(["a", "b"]))).toEqual(["events_core"]);
    expect(route(listed(["a", "x".repeat(200)]))).toEqual(["events_full"]);
  });

  it("routes an IN that is not a list of short values over a metadata lookup to events_full", () => {
    // Only a bound list is checked value by value, so a scalar's length is
    // never checked.
    expect(
      route((eb) =>
        eb(
          firstValue(eb),
          "in",
          eb.parens(typedValue<string>("x".repeat(200), "String")),
        ),
      ),
    ).toEqual(["events_full"]);
    // Only `metadataValue` / `firstMetadataValue` vouch that their map reads
    // one relation's metadata, so a hand-built map's IN routes by its reads.
    expect(
      route((eb) =>
        eb(
          mapValue(metadataMap(eb.ref("e.metadata_names"), values(eb)), "k"),
          "in",
          eb.parens(typedValue<string>(["a"], "Array(String)")),
        ),
      ),
    ).toEqual(["events_full"]);
  });

  // `nullIf(…, '')` maps an empty entry to NULL, so `''` matches no row on
  // either table.
  it("keeps a guarded entry compared with '' on events_core, routes its guard's reads", () => {
    const guarded = (eb: EventsEb, guard: Expression<SqlBool>) =>
      ifElse(guard, nullIf(firstValue(eb), literal("")), literal(null));
    const short = (eb: EventsEb) => eb(eb.ref("e.name"), "=", "n");
    expect(route((eb) => eb(guarded(eb, short(eb)), "=", ""))).toEqual([
      "events_core",
    ]);
    expect(
      route((eb) =>
        eb(
          guarded(eb, short(eb)),
          "in",
          eb.parens(typedValue<string>(["", "a"], "Array(String)")),
        ),
      ),
    ).toEqual(["events_core"]);
    expect(
      route((eb) => eb(guarded(eb, eb(eb.ref("e.input"), "=", "x")), "=", "")),
    ).toEqual(["events_full"]);
    expect(route((eb) => startsWith(guarded(eb, short(eb)), ""))).toEqual([
      "events_core",
    ]);
    expect(
      route((eb) =>
        startsWith(guarded(eb, eb(eb.ref("e.input"), "=", "x")), ""),
      ),
    ).toEqual(["events_full"]);
    // Not the guarded shape: the other operands are read as they are.
    expect(
      route((eb) =>
        eb(
          ifElse(
            short(eb),
            nullIf(firstValue(eb), literal("")),
            eb.ref("e.input"),
          ),
          "=",
          "",
        ),
      ),
    ).toEqual(["events_full"]);
    expect(
      route((eb) =>
        eb(
          ifElse(
            short(eb),
            nullIf(firstValue(eb), eb.ref("e.input")),
            literal(null),
          ),
          "=",
          "",
        ),
      ),
    ).toEqual(["events_full"]);
    // A `coalesce` wrapper or a `concat` inner can return the full value, so
    // neither is unwrapped.
    expect(
      route((eb) =>
        eb(
          eb.fn<string | null>("coalesce", [
            short(eb),
            nullIf(firstValue(eb), literal("")),
            literal(null),
          ]),
          "=",
          "",
        ),
      ),
    ).toEqual(["events_full"]);
    expect(
      route((eb) =>
        eb(
          ifElse(
            short(eb),
            eb.fn<string>("concat", [firstValue(eb), literal("")]),
            literal(null),
          ),
          "=",
          "",
        ),
      ),
    ).toEqual(["events_full"]);
  });

  // NULL exactly where the entry is `''` (or the guard fails), and a cut
  // entry is `''` exactly where the full one is.
  it("keeps IS [NOT] NULL over a guarded or nullIf entry on events_core, routes its guard's reads", () => {
    const nonEmpty = (eb: EventsEb) => nullIf(firstValue(eb), literal(""));
    const guarded = (eb: EventsEb, guard: Expression<SqlBool>) =>
      ifElse(guard, nonEmpty(eb), literal(null));
    const short = (eb: EventsEb) => eb(eb.ref("e.name"), "=", "n");
    expect(route((eb) => eb(guarded(eb, short(eb)), "is not", null))).toEqual([
      "events_core",
    ]);
    expect(route((eb) => eb(guarded(eb, short(eb)), "is", null))).toEqual([
      "events_core",
    ]);
    expect(route((eb) => eb(nonEmpty(eb), "is not", null))).toEqual([
      "events_core",
    ]);
    expect(
      route((eb) =>
        eb(guarded(eb, eb(eb.ref("e.input"), "=", "x")), "is not", null),
      ),
    ).toEqual(["events_full"]);
    // `nullIf(x, 'v')` is NULL where a cut entry equals a longer `v`.
    expect(
      route((eb) => eb(nullIf(firstValue(eb), literal("v")), "is not", null)),
    ).toEqual(["events_full"]);
    // Only a metadata lookup is cut in place; a substring past the cut is not.
    expect(
      route((eb) =>
        eb(
          nullIf(
            eb.fn<string>("substring", [eb.ref("e.input"), literal(300)]),
            literal(""),
          ),
          "is not",
          null,
        ),
      ),
    ).toEqual(["events_full"]);
    expect(
      routedTables(
        routeAlone(
          db
            .selectFrom("events_truncated as e")
            .select((eb) => guarded(eb, short(eb)).as("owner"))
            .where((eb) => eb(guarded(eb, short(eb)), "is not", null)),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  // `hasAllTokens(values, …)` holds for every row whose entry equals the
  // value, on the truncated copy too.
  it("keeps a prefilter beside its short comparison on events_core", () => {
    expect(
      route((eb) =>
        eb.and([
          metadataTokenPrefilter(values(eb), "x y", "="),
          eb(firstValue(eb), "=", "x y"),
        ]),
      ),
    ).toEqual(["events_core"]);
    expect(
      route((eb) =>
        eb.and([
          eb.parens(startsWith(firstValue(eb), "x")),
          metadataSubstringPrefilter(values(eb), "x", "starts with"),
        ]),
      ),
    ).toEqual(["events_core"]);
  });

  it("vouches a prefilter in an enclosing AND chain of where calls", () => {
    expect(
      routedTables(
        routeAlone(
          db
            .selectFrom("events as e")
            .select("e.span_id")
            .where((eb) => metadataTokenPrefilter(values(eb), "x", "="))
            .where("e.name", "=", "n")
            .where((eb) => eb(firstValue(eb), "=", "x")),
        ),
      ),
    ).toEqual(["events_core"]);
  });

  // Alone, a prefilter misses tokens past code point 200 on events_core.
  it.each([
    ["alone", (eb: EventsEb) => metadataTokenPrefilter(values(eb), "x", "=")],
    [
      "beside a comparison of another value",
      (eb: EventsEb) =>
        eb.and([
          metadataTokenPrefilter(values(eb), "x", "="),
          eb(firstValue(eb), "=", "y"),
        ]),
    ],
    [
      "beside a comparison of another operator",
      (eb: EventsEb) =>
        eb.and([
          metadataSubstringPrefilter(values(eb), "x", "contains"),
          startsWith(firstValue(eb), "x"),
        ]),
    ],
    [
      "beside a comparison that is not core-safe",
      (eb: EventsEb) =>
        eb.and([
          metadataTokenPrefilter(values(eb), "x".repeat(200), "="),
          eb(firstValue(eb), "=", "x".repeat(200)),
        ]),
    ],
    [
      "with its comparison under an OR",
      (eb: EventsEb) =>
        eb.and([
          metadataTokenPrefilter(values(eb), "x", "="),
          eb.or([eb(firstValue(eb), "=", "x"), eb("e.name", "=", "n")]),
        ]),
    ],
    [
      "with its comparison under an OR of ANDs",
      (eb: EventsEb) =>
        eb.or([
          metadataTokenPrefilter(values(eb), "x", "="),
          eb.and([eb(firstValue(eb), "=", "x"), eb("e.name", "=", "n")]),
        ]),
    ],
  ])("routes a prefilter %s to events_full", (_, predicate) => {
    expect(route(predicate)).toEqual(["events_full"]);
  });

  const number = (eb: EventsEb) =>
    toFloat64OrNull(
      firstMetadataValue(
        eb.ref("e.metadata_names"),
        eb.ref("e.metadata_values"),
        eb.val("k"),
      ),
    );

  // A parsed value compares as a number, which events_core keeps whole.
  it.each(filterOperators.numberObject)(
    "keeps a numeric %s on events_core",
    (operator) => {
      expect(route((eb) => eb(number(eb), operator, 1.5))).toEqual([
        "events_core",
      ]);
    },
  );

  it.each([
    [
      "another function over the lookup",
      (eb: EventsEb) =>
        eb(eb.fn<number>("lengthUTF8", [firstValue(eb)]), ">", 1),
    ],
    ["a parsed lookup under `<>`", (eb: EventsEb) => eb(number(eb), "<>", 1)],
    [
      "a parsed lookup against a string",
      (eb: EventsEb) => eb(number(eb), ">", typedValue<number>("1", "String")),
    ],
    [
      "a lookup against a number",
      (eb: EventsEb) =>
        eb(firstValue(eb), "=", typedValue<string>(5, "Float64")),
    ],
  ])("routes %s to events_full", (_, predicate) => {
    expect(route(predicate)).toEqual(["events_full"]);
  });

  it("routes a prefilter over another relation than its comparison", () => {
    const query = db
      .selectFrom("events as a")
      .innerJoin("events as b", "a.span_id", "b.span_id")
      .select("a.span_id")
      .where((eb) =>
        eb.and([
          metadataTokenPrefilter(eb.ref("b.metadata_values"), "x", "="),
          eb(
            firstMetadataValue(
              eb.ref("a.metadata_names"),
              eb.ref("a.metadata_values"),
              eb.val("k"),
            ),
            "=",
            "x",
          ),
        ]),
      );

    expect(routedTables(routeAlone(query))).toEqual([
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
      routeAlone(
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where(astPredicate(operator, value)),
      ),
    );

    expect(routed).toBe(legacyNeedsFull ? "events_full" : "events_core");
  });

  // A `typedValue` bind carries its string inside a `TypedParam`; routing
  // length-checks it like a plain bind.
  it.each(
    lengthSensitive.flatMap((operator) =>
      values.map(({ label, value }) => ({ operator, label, value })),
    ),
  )("metadata $operator, $label, typed bind", ({ operator, value }) => {
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
    const bound = typedValue<string>(value, "String");
    const [routed] = routedTables(
      routeAlone(
        db
          .selectFrom("events as e")
          .select("e.span_id")
          .where((eb) =>
            operator === "="
              ? eb(eventsMetadata(eb, "k"), "=", bound)
              : startsWith(eventsMetadata(eb, "k"), bound),
          ),
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
      routeAlone(
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

// The routing pass alone: every logical events relation, wherever a select
// holds it, becomes one physical table, `events_full` only when it reads a
// truncated column, and no logical name reaches the SQL.
describe("routing pass alone", () => {
  /** `select e.span_id from events as e [where e.input = 'x']`. */
  const eventsRead = (readsInput: boolean) =>
    db
      .selectFrom("events as e")
      .select("e.span_id")
      .$if(readsInput, (qb) => qb.where("e.input", "=", "x"));

  const positions = [
    ["the FROM", (readsInput: boolean) => eventsRead(readsInput)],
    [
      "a JOIN",
      (readsInput: boolean) =>
        db
          .selectFrom("traces as t")
          .innerJoin("events as e", "e.trace_id", "t.id")
          .select("t.id")
          .$if(readsInput, (qb) => qb.where("e.input", "=", "x")),
    ],
    [
      "a FROM subquery",
      (readsInput: boolean) =>
        db.selectFrom(eventsRead(readsInput).as("s")).select("s.span_id"),
    ],
    [
      "an IN subquery",
      (readsInput: boolean) =>
        db
          .selectFrom("traces as t")
          .select("t.id")
          .where("t.id", "in", eventsRead(readsInput)),
    ],
    [
      "a scalar subquery",
      (readsInput: boolean) =>
        db.selectFrom("traces as t").select(eventsRead(readsInput).as("s")),
    ],
    [
      "a CTE body",
      (readsInput: boolean) =>
        db
          .with("w", () => eventsRead(readsInput))
          .selectFrom("w")
          .select("w.span_id"),
    ],
  ] as const;

  it.each(positions)(
    "routes a relation in %s by the columns it reads",
    (_position, build) => {
      const core = routeAlone(build(false));
      const full = routeAlone(build(true));
      expect(routedTables(core)).toEqual(["events_core"]);
      expect(routedTables(full)).toEqual(["events_full"]);
      for (const sql of [core, full]) {
        expect(sql).not.toMatch(/\b(?:from|join) events(?:_truncated)? /);
      }
    },
  );
});
