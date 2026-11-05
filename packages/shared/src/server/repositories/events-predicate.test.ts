/**
 * Differential suite for the events predicate lowering: every field ×
 * condition type × operator × sample value compiles through
 * `compileEventsPredicate` to the SQL, binds, `events_full` routing and
 * errors of `createFilterFromFilterState` + `FilterList`, and every search
 * scope × text to those of `eventSearchCondition`. SQL compares after
 * `clickhouse format` and positional param names.
 */
import { describe, expect, it } from "vitest";

import { eventsTableCols } from "../../eventsTable";
import {
  coerceLegacyEmptyMetadataFilters,
  filterOperators,
} from "../../interfaces/filters";
import type { TracingSearchType } from "../../interfaces/search";
import { fromFilterState } from "../../query-ast/filterStateCodec";
import type { Predicate, PredicateCondition } from "../../query-ast/predicate";
import { eventsPredicateSource } from "../../query-ast/sources";
import type { ColumnDefinition } from "../../tableDefinitions/types";
import type { EventsTableFilterState } from "../../types";
import {
  FilterList,
  filtersRequireEventsFull,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { eventSearchCondition } from "../queries/clickhouse-sql/events-observation-row-selection";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsTableUiColumnDefinitions } from "../tableMappings/mapEventsTable";
import { compileClickhouseQuery } from "../query-ast/compile";
import { getClickhouseKysely } from "../query-ast/dialect";
import {
  compileEventsPredicate,
  compileEventsSearch,
  lowerEventsPredicate,
  lowerEventsSearch,
} from "./events-predicate";
import { EVENTS_FIELD_LOWERINGS } from "./events-predicate-fields";
import {
  clickhouseFormatAvailable,
  clickhouseLocalAvailable,
  executeClickhouseLocal,
  formatSql,
  formatSqlBatch,
  normalizeParams,
  substituteNamedParams,
} from "./goldenHarness";

type FilterStateCondition = EventsTableFilterState[number];

type Outcome =
  | {
      sql: string;
      params: Record<string, unknown>;
      requiresEventsFull: boolean;
    }
  | { error: string };

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

// `eventsTraceName` writes `coalesce`, the raw SQL `COALESCE`; ClickHouse
// function names are case-insensitive and `clickhouse format` keeps the case.
const normalizeFunctionCase = (sql: string) =>
  sql.replaceAll("COALESCE(", "coalesce(");

// The raw-SQL usage, cost and duration definitions read these columns
// unqualified; the lowering qualifies every column with `e.`.
const normalizeQualifiers = (sql: string) =>
  sql.replace(
    /(?<![.\w])(cost_details|usage_details|start_time|end_time)\b/g,
    "e.$1",
  );

type Compiled = {
  sql: string;
  params: Record<string, unknown>;
  requiresEventsFull: boolean;
};
type Raw = Compiled | { error: string };

const PLACEHOLDER = /\{[A-Za-z_][A-Za-z0-9_]*\s*:\s*([^}]+)\}/g;

/**
 * Formatted SQL with every bind inlined, plus the placeholder types in order:
 * equal for two conditions that differ only in bind names or in sharing a
 * placeholder between equal values.
 */
const comparable = (sql: string, raw: Compiled): Outcome => ({
  sql: substituteNamedParams(sql, raw.params),
  params: {
    types: [...sql.matchAll(PLACEHOLDER)].map((match) => match[1].trim()),
  },
  requiresEventsFull: raw.requiresEventsFull,
});

/**
 * Each outcome with its SQL formatted (one `clickhouse format` process for
 * all) and its params renamed positionally.
 */
const normalizeAll = (raws: readonly Raw[]): Outcome[] => {
  const withSql = raws.filter(
    (raw): raw is Compiled => "sql" in raw && raw.sql !== "",
  );
  const formatted = formatSqlBatch(
    withSql.map((raw) => `SELECT 1 FROM events AS e WHERE ${raw.sql}`),
  );
  const byRaw = new Map(withSql.map((raw, index) => [raw, formatted[index]]));
  return raws.map((raw) => {
    if (!("sql" in raw)) return raw;
    const sql = byRaw.get(raw);
    if (sql === undefined) return { ...raw, params: {} };
    return comparable(normalizeQualifiers(normalizeFunctionCase(sql)), raw);
  });
};

const errorOf = (error: unknown): Raw => ({
  error: error instanceof Error ? error.name : String(error),
});

const legacyFilter = (filter: FilterStateCondition[]): Raw => {
  try {
    const list = new FilterList(
      createFilterFromFilterState(
        coerceLegacyEmptyMetadataFilters(filter) as FilterStateCondition[],
        eventsTableUiColumnDefinitions,
        eventsTableCols as ColumnDefinition[],
      ),
    );
    const { query, params } = list.apply();
    return {
      sql: query,
      params,
      requiresEventsFull: filtersRequireEventsFull(list),
    };
  } catch (error) {
    return errorOf(error);
  }
};

const loweredFilter = (filter: FilterStateCondition[]): Raw => {
  try {
    return compileEventsPredicate(fromFilterState({ filter }).predicate);
  } catch (error) {
    return errorOf(error);
  }
};

/** `[name, lowered, legacy]` per case, both outcomes normalized. */
const compared = (
  cases: readonly [string, FilterStateCondition[]][],
): [string, Outcome, Outcome][] => {
  if (!clickhouseFormatAvailable()) return [];
  const outcomes = normalizeAll(
    cases.flatMap(([, filter]) => [
      loweredFilter(filter),
      legacyFilter(filter),
    ]),
  );
  return cases.map(([name], index) => [
    name,
    outcomes[2 * index],
    outcomes[2 * index + 1],
  ]);
};

const KEY = "env";
const STRINGS = ["needle", "", "50%_off\\", "Ünï cödé", "--"];
const METADATA_STRINGS = [
  ...STRINGS,
  "a".repeat(199),
  "a".repeat(200),
  "a".repeat(201),
];
const NUMBERS = [1.5, 0, -3];
const DATE = new Date("2026-01-02T03:04:05.678Z");
const OPTION_LISTS = [["alpha", "Beta"], [""], ["", "x"], []];
const ARRAY_LISTS = [["alpha", "beta"], []];

/** FilterState conditions for one field, condition type and operator. */
function samples(
  column: string,
  type: string,
  operator: string,
): FilterStateCondition[] {
  const make = (value: unknown, key?: string) =>
    ({
      column,
      type,
      operator,
      value,
      ...(key !== undefined ? { key } : {}),
    }) as FilterStateCondition;
  switch (type) {
    case "string":
      return STRINGS.map((value) => make(value));
    case "number":
      return NUMBERS.map((value) => make(value));
    case "datetime":
      return [make(DATE)];
    case "boolean":
      return [make(true), make(false)];
    case "stringOptions":
      return OPTION_LISTS.map((value) => make(value));
    case "arrayOptions":
      return ARRAY_LISTS.map((value) => make(value));
    case "stringObject":
      return METADATA_STRINGS.map((value) => make(value, KEY));
    default:
      return [];
  }
}

const loweredFields = eventsPredicateSource.fields.filter(
  (field) => EVENTS_FIELD_LOWERINGS[field.id] !== undefined,
);

// Every lowered field × accepted condition type × operator × sample value,
// plus `null` on every field. `numberObject` on metadata has no FilterState
// counterpart; its tests are below.
const conditionCases: [string, FilterStateCondition][] = loweredFields.flatMap(
  (field) => [
    ...Object.entries(field.operators).flatMap(([type, operators]) =>
      (operators ?? []).flatMap((operator) =>
        samples(field.id, type, operator).map(
          (filter) =>
            [
              `${field.id} ${type} ${operator} ${JSON.stringify(filter.value).slice(0, 40)}`,
              filter,
            ] as [string, FilterStateCondition],
        ),
      ),
    ),
    ...filterOperators.null.map(
      (operator) =>
        [
          `${field.id} null ${operator}`,
          { column: field.id, type: "null", operator, value: "" },
        ] as [string, FilterStateCondition],
    ),
  ],
);

describeWithClickhouse("events predicate lowering vs FilterList", () => {
  it("covers every lowered field", () => {
    expect(conditionCases.length).toBeGreaterThan(500);
    expect(Object.keys(EVENTS_FIELD_LOWERINGS).sort()).toEqual(
      loweredFields.map((field) => field.id).sort(),
    );
  });

  it.each(compared(conditionCases.map(([name, filter]) => [name, [filter]])))(
    "%s",
    (_name, lowered, legacy) => {
      expect(lowered).toEqual(legacy);
    },
  );

  it.each(
    compared([
      [
        "metadata, ngram string, empty-equals-null, number",
        [
          {
            column: "metadata",
            type: "stringObject",
            key: KEY,
            operator: "contains",
            value: "needle",
          },
          { column: "name", type: "string", operator: "=", value: "Gen" },
          { column: "release", type: "string", operator: "=", value: "" },
          { column: "latency", type: "number", operator: ">", value: 2 },
        ],
      ],
      [
        "legacy spellings and a full-text match",
        [
          {
            column: "Trace Environment",
            type: "stringOptions",
            operator: "none of",
            value: ["prod"],
          },
          {
            column: "tags",
            type: "arrayOptions",
            operator: "all of",
            value: [],
          },
          { column: "input", type: "string", operator: "matches", value: "q" },
        ],
      ],
    ] as [string, FilterStateCondition[]][]),
  )("conjunction: %s", (_name, lowered, legacy) => {
    expect(lowered).toEqual(legacy);
  });

  it("compiles an empty conjunction to no condition", () => {
    expect(compileEventsPredicate({ kind: "and", children: [] })).toEqual({
      sql: "",
      params: {},
      requiresEventsFull: false,
    });
  });

  it("names the placeholders of each call apart", () => {
    const predicate = fromFilterState({
      filter: [{ column: "name", type: "string", operator: "=", value: "x" }],
    }).predicate;
    const first = Object.keys(compileEventsPredicate(predicate).params);
    const second = Object.keys(compileEventsPredicate(predicate).params);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^pred[A-Za-z]{5}_1$/);
    expect(second[0]).not.toBe(first[0]);
  });
});

const SEARCH_SCOPES: TracingSearchType[][] = [
  ["id"],
  ["content"],
  ["input"],
  ["output"],
  ["content", "id"],
  ["input", "output"],
];
const SEARCH_TEXTS = ["needle", "你好", "--", "50%_off", "Ünï x"];

const searchCases = SEARCH_SCOPES.flatMap((scopes) =>
  SEARCH_TEXTS.map((text) => ({
    name: `${scopes.join("+")} ${text}`,
    text,
    scopes,
  })),
);

/** `[name, lowered, legacy]` per search case, both outcomes normalized. */
const comparedSearches = (): [string, Outcome, Outcome][] => {
  if (!clickhouseFormatAvailable()) return [];
  const outcomes = normalizeAll(
    searchCases.flatMap(({ text, scopes }) => {
      const legacy = eventSearchCondition({ query: text, searchType: scopes });
      return [
        compileEventsSearch({ text, scopes }),
        {
          sql: legacy.query.replace(/^AND /, ""),
          params: legacy.params,
          requiresEventsFull: legacy.requiresEventsFull,
        },
      ];
    }),
  );
  return searchCases.map(({ name }, index) => [
    name,
    outcomes[2 * index],
    outcomes[2 * index + 1],
  ]);
};

describeWithClickhouse("events search lowering vs eventSearchCondition", () => {
  it.each(comparedSearches())("%s", (_name, lowered, legacy) => {
    expect(lowered).toEqual(legacy);
  });

  it("compiles no search to no condition", () => {
    expect(compileEventsSearch(undefined)).toEqual({
      sql: "",
      params: {},
      requiresEventsFull: false,
    });
  });
});

type StringCondition = Extract<PredicateCondition, { type: "string" }>;

const condition = (
  column: string,
  op: StringCondition["op"],
  value: string,
): StringCondition => ({
  kind: "condition",
  type: "string",
  field: { id: column },
  op,
  value,
});

describeWithClickhouse("events predicate structure", () => {
  const formatted = (predicate: Predicate) => {
    const { sql, params } = compileEventsPredicate(predicate);
    return normalizeParams(
      formatSql(`SELECT 1 FROM events AS e WHERE ${sql}`),
      params,
    );
  };

  it("groups an or of conditions, each condition's conjuncts in parens", () => {
    expect(
      formatted({
        kind: "or",
        children: [
          condition("name", "=", "a"),
          {
            kind: "condition",
            type: "stringObject",
            field: { id: "metadata", key: KEY },
            op: "is set",
            value: "",
          },
          {
            kind: "condition",
            type: "stringObject",
            field: { id: "metadata", key: KEY },
            op: "=",
            value: "--",
          },
        ],
      }),
    ).toMatchInlineSnapshot(`
      {
        "params": {
          "param1": "a",
          "param2": "env",
          "param3": "--",
        },
        "sql": "SELECT 1
      FROM events AS e
      WHERE (((lower(e.name) = lower({param1:String})) AND (e.name = {param1:String})) OR has(e.metadata_names, {param2:String}) OR (has(e.metadata_names, {param2:String}) AND ((e.metadata_values[indexOf(e.metadata_names, {param2:String})]) = {param3:String})))",
      }
    `);
  });

  it("negates a condition as a whole", () => {
    expect(
      formatted({
        kind: "not",
        child: {
          kind: "condition",
          type: "stringObject",
          field: { id: "metadata", key: KEY },
          op: "=",
          value: "--",
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "params": {
          "param1": "env",
          "param2": "--",
        },
        "sql": "SELECT 1
      FROM events AS e
      WHERE NOT (has(e.metadata_names, {param1:String}) AND ((e.metadata_values[indexOf(e.metadata_names, {param1:String})]) = {param2:String}))",
      }
    `);
  });

  it("matches nothing for an empty or and everything for an empty and", () => {
    expect(
      formatted({
        kind: "and",
        children: [
          { kind: "or", children: [] },
          { kind: "not", child: { kind: "and", children: [] } },
        ],
      }),
    ).toMatchInlineSnapshot(`
      {
        "params": {},
        "sql": "SELECT 1
      FROM events AS e
      WHERE false AND (NOT (true))",
      }
    `);
  });

  it("routes a nested input condition to events_full", () => {
    expect(
      compileEventsPredicate({
        kind: "not",
        child: { kind: "or", children: [condition("input", "=", "a")] },
      }).requiresEventsFull,
    ).toBe(true);
  });

  it.each([
    ["an unknown field", condition("nope", "=", "a"), "InvalidRequestError"],
    [
      "an operator the field does not take",
      condition("name", "matches", "a"),
      "InvalidRequestError",
    ],
    [
      "a score field",
      {
        kind: "condition",
        type: "numberObject",
        field: { id: "scores_avg", key: "k" },
        op: ">",
        value: 1,
      },
      "QueryCompileError",
    ],
    [
      "a positionInTrace condition",
      {
        kind: "condition",
        type: "positionInTrace",
        field: { id: "id", key: "root" },
        op: "=",
      },
      "QueryCompileError",
    ],
  ] as [string, Predicate, string][])(
    "rejects %s",
    (_name, predicate, error) => {
      expect(() => compileEventsPredicate(predicate)).toThrow(
        expect.objectContaining({ name: error }),
      );
    },
  );
});

type NumberObjectCondition = Extract<
  PredicateCondition,
  { type: "numberObject" }
>;

const numericMetadata = (
  op: NumberObjectCondition["op"],
  value: number,
): NumberObjectCondition => ({
  kind: "condition",
  type: "numberObject",
  field: { id: "metadata", key: "n" },
  op,
  value,
});

const describeWithClickhouseLocal = clickhouseLocalAvailable()
  ? describe
  : describe.skip;

describeWithClickhouseLocal("numeric metadata conditions", () => {
  // One row per case: `num` holds a number, `text` a non-number, `other`
  // another key, `dup` the key twice (the first entry counts).
  const ROWS = `
    SELECT 'num' AS span_id, ['n'] AS metadata_names, ['42'] AS metadata_values
    UNION ALL SELECT 'text', ['n'], ['abc']
    UNION ALL SELECT 'other', ['m'], ['42']
    UNION ALL SELECT 'dup', ['n', 'n'], ['5', '100']
    UNION ALL SELECT 'float', ['n'], ['-0.5']`;

  const matching = (predicate: Predicate) => {
    const { sql, params } = compileEventsPredicate(predicate);
    return executeClickhouseLocal(
      substituteNamedParams(
        `SELECT span_id FROM (${ROWS}) AS e WHERE ${sql} ORDER BY span_id`,
        params,
      ),
    ).split("\n");
  };

  it.each([
    ["=", 42, ["num"]],
    [">", 10, ["num"]],
    ["<", 10, ["dup", "float"]],
    [">=", 5, ["dup", "num"]],
    ["<=", -0.5, ["float"]],
  ] as const)("%s %s", (op, value, expected) => {
    expect(matching(numericMetadata(op, value))).toEqual(expected);
  });

  // The stored value parses only when cut to its first 200 code points (the
  // `leftUTF8` copy below), so the condition needs the untruncated table.
  it("reads events_full: truncation can turn a non-number into a number", () => {
    const compiled = compileEventsPredicate(numericMetadata(">", 0));
    const long = `'1' || repeat('0', 199) || 'x'`;
    const matches = (storedValue: string) =>
      executeClickhouseLocal(
        substituteNamedParams(
          `SELECT count() FROM (SELECT ['n'] AS metadata_names, [${storedValue}] AS metadata_values) AS e WHERE ${compiled.sql}`,
          compiled.params,
        ),
      );
    expect(compiled.requiresEventsFull).toBe(true);
    expect(matches(long)).toBe("0");
    expect(matches(`leftUTF8(${long}, 200)`)).toBe("1");
  });
});

describe("lowering inside an AST query", () => {
  const compiled = (predicate: Predicate) =>
    compileClickhouseQuery(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .where((eb) => lowerEventsPredicate(eb, predicate))
        .where((eb) =>
          lowerEventsSearch(eb, { text: "needle", scopes: ["id"] }),
        ),
      "golden-project",
    ).sql;

  it("compiles with tenancy and reads events_core for short columns", () => {
    const sql = compiled(condition("name", "=", "a"));
    expect(sql).toContain("from events_core as e");
    expect(sql).toContain("e.project_id = ");
    expect(sql).toContain("lower(e.name) = lower(");
  });

  it("reads events_full for an input condition", () => {
    expect(compiled(condition("input", "contains", "a"))).toContain(
      "from events_full as e",
    );
  });

  const metadata = (
    op: Extract<PredicateCondition, { type: "stringObject" }>["op"],
    value: string,
  ): Predicate => ({
    kind: "and",
    children: [
      condition("name", "=", "a"),
      {
        kind: "condition",
        type: "stringObject",
        field: { id: "metadata", key: KEY },
        op,
        value,
      },
    ],
  });

  const hasField = (id: "hasInput" | "hasOutput"): Predicate => ({
    kind: "condition",
    type: "boolean",
    field: { id },
    op: "=",
    value: true,
  });

  it.each([
    ["a short = with a token prefilter", metadata("=", "needle"), false],
    ["a short starts with", metadata("starts with", "needle"), false],
    ["a 200-character =", metadata("=", "a".repeat(200)), true],
    ["a contains", metadata("contains", "needle"), true],
    ["a numeric comparison", numericMetadata(">", 1), true],
    ["hasInput", hasField("hasInput"), false],
    ["hasOutput", hasField("hasOutput"), false],
  ] as const)("routes %s like the bridge", (_name, predicate, full) => {
    expect(compileEventsPredicate(predicate).requiresEventsFull).toBe(full);
    expect(compiled(predicate)).toContain(
      full ? "from events_full as e" : "from events_core as e",
    );
  });
});
