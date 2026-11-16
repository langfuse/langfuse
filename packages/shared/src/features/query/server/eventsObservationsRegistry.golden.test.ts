import { describe, expect, it } from "vitest";

import {
  compileClickhouseQuery,
  renderClickhouseExpression,
} from "../../../server/query-ast/compile";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { QueryCompileError } from "../../../server/query-ast/errors";
import {
  clickhouseLocalAvailable,
  executeClickhouseLocal,
} from "../../../server/repositories/goldenHarness";
import { arrayJoin, literal } from "../../../server/query-ast/extensions";
import type { ClickHouseDatabase } from "../../../server/query-ast/schema";
import { eventsObservationsView } from "../dataModel";
import {
  expressionBuilder,
  type AliasableExpression,
  type ExpressionBuilder,
} from "kysely";
import {
  EVENTS_OBSERVATIONS_DIMENSIONS,
  EVENTS_OBSERVATIONS_MEASURES,
  aggregationSlot,
  eventsObservationsScoresJoin,
} from "./eventsObservationsRegistry";
import { isNgramSubstringTarget } from "../../../server/queries/clickhouse-sql/fts";
import { NULL_IF_EMPTY_RE } from "./nullIfEmptyFilter";

// The string builder reads each dimension and measure of
// `eventsObservationsView` as a SQL string (`dataModel.ts`); the AST builder
// reads the typed expression of the same name in
// `EVENTS_OBSERVATIONS_DIMENSIONS` / `EVENTS_OBSERVATIONS_MEASURES`. These
// tests check that each pair says the same thing: same keys and metadata,
// same filter behavior, and (with ClickHouse) the same parse tree.

// select … from events_truncated as e left join scores on <join>
// (with no WHERE filter, `events_truncated` routes to `events_core`, the
// view's `baseCte`)
const baseQuery = () =>
  getClickhouseKysely()
    .selectFrom("events_truncated as e")
    .leftJoin("scores", (join) => join.on(eventsObservationsScoresJoin));

/** Builder of {@link baseQuery}'s select list. */
type QueryBuilder = ExpressionBuilder<
  {
    e: ClickHouseDatabase["events_truncated"];
    scores: ClickHouseDatabase["scores"];
  },
  "e" | "scores"
>;

type Case = {
  /** Plain-identifier output name of the case. */
  key: string;
  legacy: string;
  build: (eb: QueryBuilder) => AliasableExpression<unknown>;
};

const view = eventsObservationsView;

/** The view's alias in the legacy strings; the registry reads it as `e`. */
const LEGACY_ALIAS = "events_observations";
/** Columns the view's measure strings read without a relation alias. */
const LEGACY_BARE_COLUMNS = ["usage_details", "cost_details", "total_cost"];

/** The legacy `@@AGGn@@` substitution of `queryBuilder.ts`, per query level. */
function legacyMeasureSql(
  sql: string,
  aggs: Record<string, string>,
  level: "single" | "two",
): string {
  let result = sql;
  for (const [slot, fn] of Object.entries(aggs)) {
    result = result.replaceAll(
      `@@${slot.toUpperCase()}@@`,
      level === "single" ? "" : fn,
    );
  }
  return result;
}

/** One case per registry entry and template level, with the view's SQL. */
function registryCases(): Case[] {
  const cases: Case[] = [];
  for (const [name, entry] of Object.entries(EVENTS_OBSERVATIONS_DIMENSIONS)) {
    const legacy = view.dimensions[name];
    cases.push({
      key: `dimension_${name}`,
      legacy: legacy.sql,
      build: (eb) => entry.expression(eb),
    });
    const pairExpand = "pairExpand" in entry ? entry.pairExpand : undefined;
    if (pairExpand) {
      cases.push({
        key: `pair_values_${name}`,
        legacy: legacy.pairExpand?.valuesSql ?? "missing_pair_expand",
        build: (eb) => pairExpand.values(eb),
      });
    }
  }
  for (const [name, entry] of Object.entries(EVENTS_OBSERVATIONS_MEASURES)) {
    const legacy = view.measures[name];
    if ("aggs" in entry) {
      for (const level of ["single", "two"] as const) {
        cases.push({
          key: `measure_${name}_${level}`,
          legacy: legacyMeasureSql(legacy.sql, legacy.aggs ?? {}, level),
          build: (eb) => entry.expression(eb, level),
        });
      }
    } else {
      cases.push({
        key: `measure_${name}`,
        legacy: legacy.sql,
        build: (eb) => entry.expression(eb),
      });
    }
  }
  cases.push({
    key: "scores_join",
    legacy: view.tableRelations.scores.joinConditionSql.replace(/^ON /, ""),
    build: (eb) => eventsObservationsScoresJoin(eb),
  });
  return cases;
}

/** Each case's registry expression as SQL text, keyed by case key. */
function renderCases(cases: Case[]): Record<string, string> {
  const eb: QueryBuilder = expressionBuilder(baseQuery());
  return Object.fromEntries(
    cases.map((c) => [c.key, renderClickhouseExpression(c.build(eb))]),
  );
}

describe("v2 observations registry", () => {
  it("has an entry for every dimension and measure of the view, in order", () => {
    expect(Object.keys(EVENTS_OBSERVATIONS_DIMENSIONS)).toEqual(
      Object.keys(view.dimensions),
    );
    expect(Object.keys(EVENTS_OBSERVATIONS_MEASURES)).toEqual(
      Object.keys(view.measures),
    );
    expect(Object.keys(view.tableRelations)).toEqual(["scores"]);
  });

  it("declares the view's aggregation slots, measure dependencies and pair-expanded aliases", () => {
    for (const [name, entry] of Object.entries(EVENTS_OBSERVATIONS_MEASURES)) {
      const { aggs, requiresDimension, relationTable } = view.measures[name];
      expect(
        {
          aggs: "aggs" in entry ? entry.aggs : undefined,
          requiresDimension:
            "requiresDimension" in entry ? entry.requiresDimension : undefined,
          relationTable:
            "relationTable" in entry ? entry.relationTable : undefined,
        },
        name,
      ).toEqual({ aggs, requiresDimension, relationTable });
    }
    for (const [name, entry] of Object.entries(
      EVENTS_OBSERVATIONS_DIMENSIONS,
    )) {
      expect(
        "pairExpand" in entry ? entry.pairExpand?.valueAlias : undefined,
        name,
      ).toEqual(view.dimensions[name].pairExpand?.valueAlias);
    }
  });

  it("types every exploded or pair-expanded dimension as an array, and lowers a filter for every other", () => {
    // A check that does not apply to a dimension reads `true`, so every
    // dimension must come out `{ array: true, filter: true }`.
    for (const [name, entry] of Object.entries(
      EVENTS_OBSERVATIONS_DIMENSIONS,
    )) {
      const { explodeArray, pairExpand } = view.dimensions[name];
      expect(
        {
          array: explodeArray || pairExpand ? entry.array : true,
          filter: pairExpand
            ? true
            : "filter" in entry && entry.filter !== undefined,
        },
        name,
      ).toEqual({ array: true, filter: true });
    }
  });

  it("keeps nullIf(column, '') recognisable for the filter path", () => {
    // Legacy `nullIf(events_observations.x, '')` must render as
    // `nullIf(e.x, '')`; a dimension without the wrapper matches on neither.
    const rendered = renderCases(registryCases());
    for (const name of Object.keys(EVENTS_OBSERVATIONS_DIMENSIONS)) {
      const legacyMatch = NULL_IF_EMPTY_RE.exec(view.dimensions[name].sql);
      const match = NULL_IF_EMPTY_RE.exec(rendered[`dimension_${name}`]);
      expect(match?.[1], name).toEqual(
        legacyMatch?.[1].replace(`${LEGACY_ALIAS}.`, "e."),
      );
    }
  });

  // The string builder's `mapFilters` compares the column inside a
  // `nullIf(column, '')` dimension with `''` and NULL as one value, any other
  // dimension as its `sql`, and adds the ngram conjunct by column name.
  // Example: `name` is `events_observations.name`, so a filter compares
  // `e.name` with the ngram conjunct; `nullIf(events_observations.environment,
  // '')` compares `e.environment`, `''` read as NULL, no ngram conjunct.
  it("lowers each dimension's filter as the string builder's mapFilters does", () => {
    const eb: QueryBuilder = expressionBuilder(baseQuery());
    const rendered = renderCases(registryCases());
    for (const [name, entry] of Object.entries(
      EVENTS_OBSERVATIONS_DIMENSIONS,
    )) {
      const filter = "filter" in entry ? entry.filter : undefined;
      // Pair-expanded dimensions have no filter (checked above).
      if (!filter) continue;
      // `x` of a legacy `nullIf(x, '')` dimension, else undefined.
      const legacyColumn = NULL_IF_EMPTY_RE.exec(
        view.dimensions[name].sql,
      )?.[1];
      const registryValue = rendered[`dimension_${name}`];
      // Left: what the registry's filter lowering declares. Right: what
      // `mapFilters` derives from the legacy string, with the compared
      // value taken from the registry's own dimension SQL.
      expect(
        {
          emptyEqualsNull: filter.emptyEqualsNull ?? false,
          ngramIndexed:
            filter.kind === "string" ? (filter.ngramIndexed ?? false) : false,
          value: renderClickhouseExpression(filter.value(eb)),
        },
        name,
      ).toEqual({
        emptyEqualsNull: legacyColumn !== undefined,
        ngramIndexed: isNgramSubstringTarget(
          "events_core",
          legacyColumn ?? view.dimensions[name].sql,
        ),
        value: legacyColumn
          ? NULL_IF_EMPTY_RE.exec(registryValue)?.[1]
          : registryValue,
      });
    }
  });

  it("compiles every entry in one query on events_core", () => {
    // The requiresDimension measures read aliases only an ARRAY JOIN defines.
    const query = baseQuery()
      .$call(
        arrayJoin((eb) => ({
          calledToolNames:
            EVENTS_OBSERVATIONS_DIMENSIONS.calledToolNames.expression(eb),
          cost_value:
            EVENTS_OBSERVATIONS_DIMENSIONS.costType.pairExpand.values(eb),
          usage_value:
            EVENTS_OBSERVATIONS_DIMENSIONS.usageType.pairExpand.values(eb),
        })),
      )
      .select((eb: QueryBuilder) =>
        registryCases()
          .filter((c) => !c.key.endsWith("_single"))
          .map((c) => c.build(eb).as(c.key)),
      );
    const { sql } = compileClickhouseQuery(query, "project-1");
    expect(sql).toContain("from events_core as e");
  });

  it("rejects a slot the measure does not declare", () => {
    const apply = () =>
      // @ts-expect-error "agg2" is not a declared slot
      aggregationSlot({ agg1: "any" }, "two")("agg2", literal(1));
    expect(apply).toThrow(QueryCompileError);
    expect(apply).toThrow('Measure has no aggregation slot "agg2".');
  });
});

const describeWithClickhouse = clickhouseLocalAvailable()
  ? describe
  : describe.skip;

/**
 * In one `clickhouse local` run: the names of the functions ClickHouse
 * resolves case-insensitively, and the parse tree of each
 * `SELECT <expression>`, in order.
 */
function explainAst(expressions: string[]): {
  caseInsensitive: Set<string>;
  trees: string[];
} {
  const [functionNames, ...trees] = executeClickhouseLocal(
    [
      "SELECT lower(name) FROM system.functions WHERE case_insensitive FORMAT TSV",
      ...expressions.map((e) => `EXPLAIN AST SELECT ${e}`),
    ].join(";\n"),
  ).split(/^(?=SelectWithUnionQuery)/m);
  return {
    caseInsensitive: new Set(functionNames.trimEnd().split("\n")),
    trees: trees.map((tree) => tree.trimEnd()),
  };
}

/**
 * The two ways a legacy and a registry parse tree of the same expression
 * differ:
 * - names of functions ClickHouse resolves case-insensitively are lower-cased
 *   (`Function COALESCE` → `Function coalesce`);
 * - the legacy alias becomes the registry's (`Identifier
 *   events_observations.name` → `Identifier e.name`);
 * - the legacy strings' bare reads of {@link LEGACY_BARE_COLUMNS} gain the
 *   registry's `e` qualifier (`Identifier total_cost` → `Identifier
 *   e.total_cost`).
 */
function normalizeTree(tree: string, caseInsensitive: Set<string>) {
  return tree
    .replace(/^(\s*Function )(\S+)/gm, (line, prefix, name) =>
      caseInsensitive.has(name.toLowerCase())
        ? `${prefix}${name.toLowerCase()}`
        : line,
    )
    .replace(new RegExp(`^(\\s*Identifier )${LEGACY_ALIAS}\\.`, "gm"), "$1e.")
    .replace(
      new RegExp(`^(\\s*Identifier )(${LEGACY_BARE_COLUMNS.join("|")})$`, "gm"),
      "$1e.$2",
    );
}

describeWithClickhouse("v2 observations registry SQL", () => {
  // Legacy string and registry SQL differ in spelling, so the check compares
  // ClickHouse's parse trees after `normalizeTree` instead of the text.
  // One `clickhouse local` run for all cases: each start takes seconds on the CI binary.
  it(
    "parses to the same tree as the view's SQL, entry by entry",
    { timeout: 30_000 },
    () => {
      const cases = registryCases();
      const rendered = renderCases(cases);
      const { caseInsensitive, trees } = explainAst([
        ...cases.map((c) => c.legacy),
        ...cases.map((c) => rendered[c.key]),
      ]);
      expect(trees).toHaveLength(2 * cases.length);
      const legacyTrees = trees.slice(0, cases.length);
      const registryTrees = trees.slice(cases.length);
      cases.forEach((c, i) => {
        expect(
          normalizeTree(registryTrees[i], caseInsensitive),
          `${c.key}\nlegacy:   ${c.legacy}\nregistry: ${rendered[c.key]}`,
        ).toEqual(normalizeTree(legacyTrees[i], caseInsensitive));
      });
    },
  );
});
