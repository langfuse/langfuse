/**
 * Differential suite for the events predicate lowering: every field ×
 * condition type × operator × sample value compiles through
 * `compileEventsPredicate` to the SQL, binds, `events_full` routing and
 * errors of `createFilterFromFilterState` + `FilterList`. SQL compares after
 * `clickhouse format` and positional param names.
 */
import { describe, expect, it } from "vitest";

import { eventsTableCols } from "../../eventsTable";
import {
  coerceLegacyEmptyMetadataFilters,
  filterOperators,
} from "../../interfaces/filters";
import { fromFilterState } from "../../query-ast/filterStateCodec";
import type { Predicate, PredicateCondition } from "../../query-ast/predicate";
import { eventsPredicateSource } from "../../query-ast/sources";
import type { ColumnDefinition } from "../../tableDefinitions/types";
import type { EventsTableFilterState } from "../../types";
import {
  FilterList,
  filtersRequireEventsFull,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsTableUiColumnDefinitions } from "../tableMappings/mapEventsTable";
import { compileClickhouseQuery } from "../query-ast/compile";
import { getClickhouseKysely } from "../query-ast/dialect";
import {
  compileEventsPredicate,
  lowerEventsPredicate,
} from "./events-predicate";
import { EVENTS_FIELD_LOWERINGS } from "./events-predicate-fields";
import {
  clickhouseFormatAvailable,
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
// unqualified; the lowering qualifies every column with `e.`. Applied to the
// `FilterList` side only, so the lowered side must qualify them itself.
const qualifyLegacyColumns = (sql: string) =>
  sql.replace(
    /(?<![.\w"])(cost_details|usage_details|start_time|end_time)\b/g,
    "e.$1",
  );

type Compiled = {
  sql: string;
  params: Record<string, unknown>;
  requiresEventsFull: boolean;
};
type Raw = Compiled | { error: string };

const PLACEHOLDER = /\{[A-Za-z_][A-Za-z0-9_]*\s*:\s*([^}]+)\}/g;

const PROJECT_ID = "golden-project";
const TENANCY_PREFIX =
  /^e\.project_id = \{(\w+):String\} and e\.is_deleted = 0 and /;

/**
 * `compileEventsPredicate` for `PROJECT_ID`, minus the project and
 * soft-delete conjuncts the compiler passes put first; `FilterList` leaves
 * both to its caller. Throws unless they lead the SQL and bind `PROJECT_ID`.
 */
const compileForProject = (predicate: Predicate): Compiled => {
  const compiled = compileEventsPredicate(predicate, PROJECT_ID);
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
    return comparable(normalizeFunctionCase(sql), raw);
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
      sql: qualifyLegacyColumns(query),
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

const STRINGS = ["needle", "", "50%_off\\", "Ünï cödé", "--"];
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
  const make = (value: unknown) =>
    ({ column, type, operator, value }) as FilterStateCondition;
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
    default:
      return [];
  }
}

const loweredFields = eventsPredicateSource.fields.filter(
  (field) => EVENTS_FIELD_LOWERINGS[field.id] !== undefined,
);

// Every lowered field × accepted condition type × operator × sample value,
// plus `null` on every field.
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
  it("covers every lowered field", () => {
    expect(conditionCases.length).toBeGreaterThan(500);
    expect(Object.keys(EVENTS_FIELD_LOWERINGS).sort()).toEqual(
      loweredFields.map((field) => field.id).sort(),
    );
  });

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
        "ngram string, empty-equals-null, number",
        [
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
    const { sql, params } = compileForProject(predicate);
    return normalizeParams(
      formatSql(`SELECT 1 FROM events AS e WHERE ${sql}`),
      params,
    );
  };

  it("groups an or of conditions", () => {
    expect(
      formatted({
        kind: "or",
        children: [condition("name", "=", "a"), condition("release", "=", "")],
      }),
    ).toMatchInlineSnapshot(`
      {
        "params": {
          "param1": "a",
        },
        "sql": "SELECT 1
      FROM events AS e
      WHERE (((lower(e.name) = lower({param1:String})) AND (e.name = {param1:String})) OR ((e.release = '') OR (e.release IS NULL)))",
      }
    `);
  });

  it("negates a condition as a whole", () => {
    expect(formatted({ kind: "not", child: condition("name", "=", "a") }))
      .toMatchInlineSnapshot(`
      {
        "params": {
          "param1": "a",
        },
        "sql": "SELECT 1
      FROM events AS e
      WHERE NOT ((lower(e.name) = lower({param1:String})) AND (e.name = {param1:String}))",
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

describe("lowering inside an AST query", () => {
  const compiled = (predicate: Predicate) =>
    compileClickhouseQuery(
      getClickhouseKysely()
        .selectFrom("events as e")
        .select("e.span_id")
        .where((eb) => lowerEventsPredicate(eb, predicate)),
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

  const hasField = (id: "hasInput" | "hasOutput"): Predicate => ({
    kind: "condition",
    type: "boolean",
    field: { id },
    op: "=",
    value: true,
  });

  it.each([
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
