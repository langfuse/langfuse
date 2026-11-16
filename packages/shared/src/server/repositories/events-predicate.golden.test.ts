/**
 * Differential suite for the events predicate lowering: every field ×
 * condition type × operator × sample value compiles through
 * `compileEventsPredicate` to the SQL, binds, `events_full` routing and
 * errors of `createFilterFromFilterState` + `FilterList`, and every search
 * scope × text to those of `eventSearchCondition`. SQL compares after
 * `clickhouse format` and positional param names. Both sides take a field's
 * column SQL from `events-predicate-fields.ts` (the column mapping renders it
 * via `eventsFieldSql`), so the filter cases check the condition wiring (type,
 * operator, binds, routing, errors), not the column expressions; the
 * row-selection goldens in `events.golden.test.ts` pin those with a filter per
 * column kind.
 */
import { describe, expect, it } from "vitest";

import { eventsTableCols } from "../../eventsTable";
import {
  coerceLegacyEmptyMetadataFilters,
  filterOperators,
} from "../../interfaces/filters";
import type { TracingSearchType } from "../../interfaces/search";
import { fromFilterState } from "../../query-ast/filterStateCodec";
import type {
  Predicate,
  PredicateCondition,
  PredicateSearch,
} from "../../query-ast/predicate";
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

type Compiled = {
  sql: string;
  params: Record<string, unknown>;
  requiresEventsFull: boolean;
};
type Raw = Compiled | { error: string };

const PLACEHOLDER = /\{[A-Za-z_][A-Za-z0-9_]*\s*:\s*([^}]+)\}/g;

const PROJECT_ID = "golden-project";
const TENANCY_PREFIX = /^e\.project_id = \{(\w+):String\} and /;

/**
 * `compiled` minus the project conjunct the tenancy pass puts first, which
 * the raw-SQL builders it is compared with omit. Throws unless it leads the
 * SQL and binds `PROJECT_ID`.
 */
const withoutTenancy = (compiled: Compiled): Compiled => {
  const match = TENANCY_PREFIX.exec(compiled.sql);
  if (!match || compiled.params[match[1]] !== PROJECT_ID) {
    throw new Error(`Missing tenancy prefix: ${compiled.sql}`);
  }
  return {
    ...compiled,
    sql: compiled.sql.slice(match[0].length),
    params: Object.fromEntries(
      Object.entries(compiled.params).filter(([name]) => name !== match[1]),
    ),
  };
};

/** `compileEventsPredicate` for `PROJECT_ID`, {@link withoutTenancy}. */
const compileForProject = (predicate: Predicate): Compiled =>
  withoutTenancy(compileEventsPredicate(predicate, PROJECT_ID));

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
    return comparable(sql, raw);
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
    return compileForProject(fromFilterState({ filter }).predicate);
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

// `numberObject` on metadata has no FilterState counterpart, so `samples`
// returns none; it runs in clickhouse local instead, one row per operator:
// `[op, value, matching span ids]` over the rows of "numeric metadata
// conditions".
const NUMERIC_METADATA_CASES = [
  ["=", 42, ["num"]],
  [">", 10, ["inf", "num"]],
  ["<", 10, ["dup", "float"]],
  [">=", 5, ["dup", "inf", "num"]],
  ["<=", -0.5, ["float"]],
  // Beyond the range of `Decimal64(12)`.
  ["<", 1e10, ["dup", "float", "num"]],
] as const;

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

// The routing pass reads `e.input = ''`, `e.input != ''` and
// `e.input is [not] null` on events_core: the truncated copy is '' exactly
// when the full value is, and neither is ever NULL. `filtersRequireEventsFull`
// reads events_full for every input/output filter. `is not empty` ignores its
// sample value, so every sample matches.
const CORE_WHERE_LEGACY_READS_FULL =
  /^(input|output) (string = ""|string is not empty .*|null is null|null is not null)$/;

describeWithClickhouse("events predicate lowering vs FilterList", () => {
  it.each(compared(conditionCases.map(([name, filter]) => [name, [filter]])))(
    "%s",
    (name, lowered, legacy) => {
      if (!CORE_WHERE_LEGACY_READS_FULL.test(name)) {
        expect(lowered).toEqual(legacy);
        return;
      }
      expect(legacy).toMatchObject({ requiresEventsFull: true });
      expect(lowered).toEqual({ ...legacy, requiresEventsFull: false });
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

describe("events predicate lowering", () => {
  // The cases above come from `samples`, which returns none for a condition
  // type it does not know, so a lowered field's type would go untested.
  // Metadata `numberObject` counts as sampled by `NUMERIC_METADATA_CASES`.
  it("samples every operator of every lowered field", () => {
    const unsampled = loweredFields.flatMap((field) =>
      Object.entries(field.operators).flatMap(([type, operators]) =>
        (operators ?? [])
          .filter(
            (operator) =>
              samples(field.id, type, operator).length === 0 &&
              !(
                field.id === "metadata" &&
                type === "numberObject" &&
                NUMERIC_METADATA_CASES.some(([op]) => op === operator)
              ),
          )
          .map((operator) => `${field.id} ${type} ${operator}`),
      ),
    );
    expect(unsampled).toEqual([]);
  });

  // `loweredFields` starts from the source, so a lowering keyed by an id the
  // source lacks (a renamed field) is reached by no case.
  it("lowers only fields of the events predicate source", () => {
    const sourceIds = new Set(loweredFields.map((field) => field.id));
    expect(
      Object.keys(EVENTS_FIELD_LOWERINGS).filter((id) => !sourceIds.has(id)),
    ).toEqual([]);
  });

  it("scopes an empty conjunction to the project", () => {
    const compiled = compileEventsPredicate(
      { kind: "and", children: [] },
      PROJECT_ID,
    );
    const match = TENANCY_PREFIX.exec(compiled.sql);
    expect(compiled.params).toEqual({ [match?.[1] ?? "none"]: PROJECT_ID });
    expect(compiled.sql.replace(TENANCY_PREFIX, "")).toBe("true");
    expect(compiled.requiresEventsFull).toBe(false);
  });

  it("names the placeholders of each call apart", () => {
    const predicate = fromFilterState({
      filter: [{ column: "name", type: "string", operator: "=", value: "x" }],
    }).predicate;
    const first = Object.keys(compileForProject(predicate).params);
    const second = Object.keys(compileForProject(predicate).params);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^pred[A-Za-z]{5}_2$/);
    expect(second[0]).not.toBe(first[0]);
  });

  it("routes a nested input condition to events_full", () => {
    expect(
      compileEventsPredicate(
        {
          kind: "not",
          child: { kind: "or", children: [condition("input", "=", "a")] },
        },
        PROJECT_ID,
      ).requiresEventsFull,
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
      "an empty metadata substring",
      {
        kind: "condition",
        type: "stringObject",
        field: { id: "metadata", key: "k" },
        op: "ends with",
        value: "",
      },
      "InvalidRequestError",
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
      expect(() => compileEventsPredicate(predicate, PROJECT_ID)).toThrow(
        expect.objectContaining({ name: error }),
      );
    },
  );
});

const SEARCH_SCOPES: TracingSearchType[][] = [
  ["id"],
  ["content"],
  ["input"],
  ["output"],
  ["content", "id"],
  ["input", "output"],
];
const SEARCH_TEXTS = ["needle", "你好", "--", "50%_off", "Ünï x", "—"];

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
        withoutTenancy(compileEventsSearch({ text, scopes }, PROJECT_ID)),
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
});

describe("events search lowering", () => {
  it.each([
    ["an empty text", { text: "", scopes: ["id"] }],
    ["no scopes", { text: "needle", scopes: [] }],
    ["a scope outside TracingSearchType", { text: "needle", scopes: ["x"] }],
  ] as [string, PredicateSearch][])("rejects %s", (_name, search) => {
    expect(() => compileEventsSearch(search, PROJECT_ID)).toThrow(
      expect.objectContaining({ name: "InvalidRequestError" }),
    );
  });
});

describeWithClickhouse("events predicate structure", () => {
  const formatted = (predicate: Predicate) => {
    const { sql, params } = compileForProject(predicate);
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
  // another key, `dup` the key twice (the first entry counts), `inf` a value
  // that parses to infinity, `nan` one that parses to nan (no comparison
  // matches it).
  const ROWS = `
    SELECT 'num' AS span_id, ['n'] AS metadata_names, ['42'] AS metadata_values
    UNION ALL SELECT 'text', ['n'], ['abc']
    UNION ALL SELECT 'other', ['m'], ['42']
    UNION ALL SELECT 'dup', ['n', 'n'], ['5', '100']
    UNION ALL SELECT 'float', ['n'], ['-0.5']
    UNION ALL SELECT 'inf', ['n'], ['inf']
    UNION ALL SELECT 'nan', ['n'], ['nan']`;

  // `substituteNamedParams` drops a number's bind type, so each placeholder
  // is cast to its type first, as the server binds it.
  const matching = (predicate: Predicate) => {
    const { sql, params } = compileForProject(predicate);
    const typed = sql.replace(
      /\{[A-Za-z0-9_]+:([^}]+)\}/g,
      (placeholder, type: string) => `CAST(${placeholder} AS ${type})`,
    );
    return executeClickhouseLocal(
      substituteNamedParams(
        `SELECT span_id FROM (${ROWS}) AS e WHERE ${typed} ORDER BY span_id`,
        params,
      ),
    ).split("\n");
  };

  it.each(NUMERIC_METADATA_CASES)("%s %s", (op, value, expected) => {
    expect(matching(numericMetadata(op, value))).toEqual(expected);
  });

  // Plain three-valued NOT: `nan > 10` is false (not NULL), so `not` matches
  // `nan`; `text` parses to NULL and stays out.
  it("not: matches a row without the key, a smaller value or nan", () => {
    expect(matching({ kind: "not", child: numericMetadata(">", 10) })).toEqual([
      "dup",
      "float",
      "nan",
      "other",
    ]);
  });

  // Accepted on events_core: a stored value over 200 code points compares by
  // its 200-code-point cut (the `leftUTF8` copy below), so it can match or
  // miss there. A non-number can parse once cut (pinned here), and a long
  // number can parse to another (1e300 cut to 1e199, 250 zeros and 5 to 0).
  it("reads events_core: truncation can turn a non-number into a number", () => {
    const compiled = compileForProject(numericMetadata(">", 0));
    const long = `'1' || repeat('0', 199) || 'x'`;
    const matches = (storedValue: string) =>
      executeClickhouseLocal(
        substituteNamedParams(
          `SELECT count() FROM (SELECT ['n'] AS metadata_names, [${storedValue}] AS metadata_values) AS e WHERE ${compiled.sql}`,
          compiled.params,
        ),
      );
    expect(compiled.requiresEventsFull).toBe(false);
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
      PROJECT_ID,
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
    ["a numeric comparison", numericMetadata(">", 1), false],
    ["hasInput", hasField("hasInput"), false],
    ["hasOutput", hasField("hasOutput"), false],
  ] as const)("routes %s like the bridge", (_name, predicate, full) => {
    expect(
      compileEventsPredicate(predicate, PROJECT_ID).requiresEventsFull,
    ).toBe(full);
    expect(compiled(predicate)).toContain(
      full ? "from events_full as e" : "from events_core as e",
    );
  });
});
