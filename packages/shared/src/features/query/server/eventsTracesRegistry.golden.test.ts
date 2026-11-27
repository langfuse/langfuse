// Pins that the AST registry and eventsTracesView SQL strings agree.

import {
  ExpressionWrapper,
  expressionBuilder,
  type AliasableExpression,
} from "kysely";
import { describe, expect, it } from "vitest";

import { renderClickhouseExpression } from "../../../server/query-ast/compile";
import { eventsIsRootObservation } from "../../../server/repositories/events-selects";
import {
  clickhouseLocalAvailable,
  executeClickhouseLocal,
} from "../../../server/repositories/__tests__/goldenHarness";
import { isNgramSubstringTarget } from "../../../server/queries/clickhouse-sql/fts";
import { eventsTracesView } from "../dataModel";
import { metricAggregations } from "../types";
import {
  EVENTS_TRACES_DIMENSIONS,
  EVENTS_TRACES_MEASURES,
  eventsTracesDimension,
  eventsTracesMeasure,
  eventsTracesScoresJoin,
  type TracesDb,
} from "./eventsTracesRegistry";
import { NULL_IF_EMPTY_RE } from "./nullIfEmptyFilter";

// The string builder read each dimension, measure, pruning column and the
// root-event condition of `eventsTracesView` as a SQL string
// (`dataModel.ts`); the AST builder reads the typed expression of the same
// name in `EVENTS_TRACES_DIMENSIONS` / `EVENTS_TRACES_MEASURES`, and the
// root-event condition from `eventsIsRootObservation` (`events-selects.ts`).
// These tests check that each pair says the same thing: same keys and
// relations, same filter behavior, and (with ClickHouse) the same parse tree.

/** Builder of a select over `e` joined with `scores`. */
const joinedBuilder = () => expressionBuilder<TracesDb, "e" | "scores">();

type Case = {
  /** Plain-identifier output name of the case. */
  key: string;
  legacy: string;
  build: () => AliasableExpression<unknown>;
};

const view = eventsTracesView;

/** The view's alias in the legacy strings; the registry reads it as `e`. */
const LEGACY_ALIAS = "events_traces";

/** The table the legacy filter mapping named, which picks the ngram conjunct. */
const LEGACY_TABLE = "events_core";

/** Each dimension's name and entry, in view order. */
const dimensionEntries = () =>
  Object.keys(EVENTS_TRACES_DIMENSIONS).map(
    (name) => [name, eventsTracesDimension(name)] as const,
  );

/** One case per registry expression, with the view's SQL. */
function registryCases(): Case[] {
  const eb = expressionBuilder<TracesDb, "e">();
  const cases: Case[] = [];
  for (const [name, entry] of dimensionEntries()) {
    const legacy = view.dimensions[name];
    cases.push({
      key: `dimension_${name}`,
      legacy: legacy.sql,
      build: () => entry.expression(eb),
    });
    const { perTrace, prunedBy = [] } = entry;
    if (perTrace) {
      cases.push({
        key: `per_trace_${name}`,
        legacy: legacy.aggregationFunction ?? "missing_aggregation",
        build: () => perTrace(eb),
      });
    }
    prunedBy.forEach((column, i) => {
      cases.push({
        key: `pruned_by_${name}_${i}`,
        legacy: legacy.filterSql?.where[i] ?? "missing_filter_sql",
        build: () => new ExpressionWrapper(column.value(eb).toOperationNode()),
      });
    });
  }
  for (const name of Object.keys(EVENTS_TRACES_MEASURES)) {
    const legacy = view.measures[name];
    const base = eventsTracesMeasure(name, legacy.defaultAggregation ?? "sum");
    cases.push({
      key: `measure_${name}`,
      legacy: legacy.sql,
      build: () =>
        "relationTable" in base
          ? base.expression(joinedBuilder())
          : base.expression(eb),
    });
    for (const [aggregation, override] of Object.entries(
      legacy.aggregationOverrides ?? {},
    )) {
      const entry = eventsTracesMeasure(
        name,
        metricAggregations.parse(aggregation),
      );
      cases.push({
        key: `measure_${name}_${aggregation}`,
        legacy: override.sql,
        build: () =>
          "relationTable" in entry
            ? entry.expression(joinedBuilder())
            : entry.expression(eb),
      });
    }
  }
  cases.push({
    key: "scores_join",
    legacy: view.tableRelations.scores.joinConditionSql.replace(/^ON /, ""),
    build: () => eventsTracesScoresJoin(joinedBuilder()),
  });
  cases.push({
    key: "root_event",
    legacy: view.rootEventCondition?.condition ?? "missing_root_event",
    build: () => eventsIsRootObservation(eb),
  });
  return cases;
}

describe("v2 traces registry", () => {
  it("has an entry for every dimension and measure of the view, in order", () => {
    expect(Object.keys(EVENTS_TRACES_DIMENSIONS)).toEqual(
      Object.keys(view.dimensions),
    );
    expect(Object.keys(EVENTS_TRACES_MEASURES)).toEqual(
      Object.keys(view.measures),
    );
    expect(Object.keys(view.tableRelations)).toEqual(["scores"]);
    expect(view.rootEventCondition?.column).toBe("trace_id");
  });

  it("gives a per-trace value to exactly the dimensions the view aggregates", () => {
    // Two copies decide one dimension: `aggregationFunction` in the view
    // forces two levels, `perTrace` is what the inner select then reads.
    const withPerTrace = dimensionEntries()
      .filter(([, entry]) => entry.perTrace)
      .map(([name]) => name);
    const aggregated = Object.entries(view.dimensions)
      .filter(([, declaration]) => declaration.aggregationFunction)
      .map(([name]) => name);
    expect(withPerTrace).toEqual(aggregated);
  });

  // The string builder's `mapFilters` compared the column inside a
  // `nullIf(column, '')` dimension with `''` and NULL as one value, any other
  // dimension as its `sql`, and added the ngram conjunct by column name, on
  // the dimension and on each pruning column. Example: `userId` is
  // `nullIf(events_traces.user_id, '')`, so a filter compares `e.user_id`,
  // `''` read as NULL, with the ngram conjunct.
  it("lowers each dimension's filter as the string builder's mapFilters does", () => {
    const eb = expressionBuilder<TracesDb, "e">();
    for (const [name, entry] of dimensionEntries()) {
      const legacySql = view.dimensions[name].sql;
      // `x` of a legacy `nullIf(x, '')` dimension, else undefined.
      const legacyColumn = NULL_IF_EMPTY_RE.exec(legacySql)?.[1];
      const rendered = renderClickhouseExpression(entry.expression(eb));
      // Each lowering with the legacy column `mapFilters` compared, and the
      // value and empty-as-NULL fact that column implies.
      const lowerings = [
        {
          lowering: entry.filter,
          legacy: legacyColumn ?? legacySql,
          value: legacyColumn ? NULL_IF_EMPTY_RE.exec(rendered)?.[1] : rendered,
          emptyEqualsNull: legacyColumn !== undefined,
        },
        ...(entry.prunedBy ?? []).map((lowering, i) => {
          const legacy = view.dimensions[name].filterSql?.where[i] ?? "";
          return {
            lowering,
            legacy,
            value: legacy.replace(`${LEGACY_ALIAS}.`, "e."),
            emptyEqualsNull: false,
          };
        }),
      ];
      for (const [
        i,
        { lowering, legacy, value, emptyEqualsNull },
      ] of lowerings.entries()) {
        // Left: what the registry's filter lowering declares. Right: what
        // `mapFilters` derived from the legacy string.
        expect(
          {
            emptyEqualsNull:
              "emptyEqualsNull" in lowering
                ? (lowering.emptyEqualsNull ?? false)
                : false,
            ngramIndexed:
              lowering.kind === "string"
                ? (lowering.ngramIndexed ?? false)
                : false,
            value: renderClickhouseExpression(lowering.value(eb)),
          },
          `${name} lowering ${i}`,
        ).toEqual({
          emptyEqualsNull,
          ngramIndexed: isNgramSubstringTarget(LEGACY_TABLE, legacy),
          value,
        });
      }
    }
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
 *   events_traces.name` → `Identifier e.name`).
 */
function normalizeTree(tree: string, caseInsensitive: Set<string>) {
  return tree
    .replace(/^(\s*Function )(\S+)/gm, (line, prefix, name) =>
      caseInsensitive.has(name.toLowerCase())
        ? `${prefix}${name.toLowerCase()}`
        : line,
    )
    .replace(new RegExp(`^(\\s*Identifier )${LEGACY_ALIAS}\\.`, "gm"), "$1e.");
}

describeWithClickhouse("v2 traces registry SQL", () => {
  // Legacy string and registry SQL differ in spelling, so the check compares
  // ClickHouse's parse trees after `normalizeTree` instead of the text.
  // One `clickhouse local` run for all cases: each start takes seconds on the CI binary.
  it(
    "parses to the same tree as the view's SQL, entry by entry",
    { timeout: 30_000 },
    () => {
      const cases = registryCases();
      const rendered = cases.map((c) => renderClickhouseExpression(c.build()));
      const { caseInsensitive, trees } = explainAst([
        ...cases.map((c) => c.legacy),
        ...rendered,
      ]);
      expect(trees).toHaveLength(2 * cases.length);
      const legacyTrees = trees.slice(0, cases.length);
      const registryTrees = trees.slice(cases.length);
      cases.forEach((c, i) => {
        expect(
          normalizeTree(registryTrees[i], caseInsensitive),
          `${c.key}\nlegacy:   ${c.legacy}\nregistry: ${rendered[i]}`,
        ).toEqual(normalizeTree(legacyTrees[i], caseInsensitive));
      });
    },
  );
});
