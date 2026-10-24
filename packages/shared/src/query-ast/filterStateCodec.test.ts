import { describe, expect, it } from "vitest";
import {
  eventsTableSingleFilter,
  filterOperators,
  FTS_MATCH_OPERATOR,
  singleFilter,
} from "../interfaces/filters";
import { TracingSearchType } from "../interfaces/search";
import {
  fromFilterState,
  PredicateNotRepresentableError,
  toFilterState,
  type FilterStateCondition,
} from "./filterStateCodec";
import {
  PREDICATE_OPERATORS,
  predicateSchema,
  type ConditionType,
  type Predicate,
} from "./predicate";

// One valid FilterState condition per variant, for a given operator.
const sampleFilter: Record<
  ConditionType,
  (operator: string) => Record<string, unknown>
> = {
  datetime: (operator) => ({
    type: "datetime",
    column: "startTime",
    operator,
    value: new Date("2026-10-01T00:00:00.000Z"),
  }),
  string: (operator) => ({
    type: "string",
    column: "input",
    operator,
    value: "needle",
  }),
  number: (operator) => ({
    type: "number",
    column: "latency",
    operator,
    value: 1.5,
  }),
  stringOptions: (operator) => ({
    type: "stringOptions",
    column: "name",
    operator,
    value: ["a", "b|c"],
  }),
  categoryOptions: (operator) => ({
    type: "categoryOptions",
    column: "score_categories",
    key: "sentiment",
    operator,
    value: ["positive"],
  }),
  arrayOptions: (operator) => ({
    type: "arrayOptions",
    column: "traceTags",
    operator,
    value: ["prod"],
  }),
  stringObject: (operator) => ({
    type: "stringObject",
    column: "metadata",
    key: "env",
    operator,
    value: "prod",
  }),
  numberObject: (operator) => ({
    type: "numberObject",
    column: "scores_avg",
    key: "accuracy",
    operator,
    value: 0.9,
  }),
  booleanObject: (operator) => ({
    type: "booleanObject",
    column: "score_booleans",
    key: "is_hallucination",
    operator,
    value: false,
  }),
  boolean: (operator) => ({
    type: "boolean",
    column: "isRootObservation",
    operator,
    value: true,
  }),
  null: (operator) => ({
    type: "null",
    column: "endTime",
    operator,
    value: "",
  }),
  positionInTrace: (operator) => ({
    type: "positionInTrace",
    column: "positionInTrace",
    key: "nthFromEnd",
    operator,
    value: 2,
  }),
};

const operatorsFor = (type: ConditionType): readonly string[] =>
  type === "string" || type === "stringObject"
    ? [...filterOperators[type], FTS_MATCH_OPERATOR]
    : filterOperators[type];

const variantOperatorCases = (
  Object.keys(filterOperators) as ConditionType[]
).flatMap((type) =>
  operatorsFor(type).map((operator) => ({
    type,
    operator,
    filter: sampleFilter[type](operator) as FilterStateCondition,
  })),
);

const isValidFilterStateCondition = (filter: unknown) =>
  singleFilter.safeParse(filter).success ||
  eventsTableSingleFilter.safeParse(filter).success;

describe("FilterState codec", () => {
  it("covers the closed operator set", () => {
    const covered = new Set(variantOperatorCases.map((c) => c.operator));
    expect([...covered].sort()).toEqual([...PREDICATE_OPERATORS].sort());
  });

  it.each(variantOperatorCases)("round-trips $type $operator", ({ filter }) => {
    expect(isValidFilterStateCondition(filter)).toBe(true);

    const predicate = fromFilterState([filter]);
    expect(predicateSchema.safeParse(predicate).success).toBe(true);
    expect(toFilterState(predicate)).toEqual({ filter: [filter] });
  });

  it.each(variantOperatorCases)(
    "round-trips $type $operator through JSON",
    ({ filter }) => {
      const wire = JSON.parse(JSON.stringify(fromFilterState([filter])));
      expect(toFilterState(predicateSchema.parse(wire))).toEqual({
        filter: [filter],
      });
    },
  );

  it("round-trips positionInTrace keys that carry no value", () => {
    const filter: FilterStateCondition = {
      type: "positionInTrace",
      column: "positionInTrace",
      key: "last",
      operator: "=",
    };
    expect(toFilterState(fromFilterState([filter]))).toEqual({
      filter: [filter],
    });
  });

  it("keeps condition order, unknown columns, and targets", () => {
    const filters: FilterStateCondition[] = [
      { ...sampleFilter.number("<"), target: "node-1" } as FilterStateCondition,
      {
        type: "string",
        column: "Some Legacy Column",
        operator: "=",
        value: "x",
      },
      sampleFilter.stringObject("is set") as FilterStateCondition,
    ];
    expect(toFilterState(fromFilterState(filters))).toEqual({
      filter: filters,
    });
  });

  it("reads legacy empty-substring metadata filters as `is set`", () => {
    for (const operator of ["contains", "starts with", "ends with"] as const) {
      const predicate = fromFilterState([
        {
          type: "stringObject",
          column: "metadata",
          key: "env",
          operator,
          value: "",
        },
      ]);
      expect(predicate.children).toEqual([
        expect.objectContaining({
          op: "is set",
          field: { id: "metadata", key: "env" },
        }),
      ]);
    }
  });

  describe("free-text lane", () => {
    const filter = sampleFilter.boolean("=") as FilterStateCondition;

    it("adds no search leaf without a query", () => {
      expect(
        fromFilterState([filter], { searchQuery: "", searchType: ["content"] }),
      ).toEqual({ kind: "and", children: [expect.anything()] });
      expect(fromFilterState([], { searchQuery: null })).toEqual({
        kind: "and",
        children: [],
      });
    });

    it.each(TracingSearchType.options.map((scope) => [scope]))(
      "round-trips scope %s",
      (scope) => {
        const search = { searchQuery: "hello", searchType: [scope] };
        expect(toFilterState(fromFilterState([filter], search))).toEqual({
          filter: [filter],
          ...search,
        });
      },
    );

    it("round-trips several scopes in their order", () => {
      const search = {
        searchQuery: "hello",
        searchType: TracingSearchType.options.toReversed(),
      };
      expect(toFilterState(fromFilterState([filter], search))).toEqual({
        filter: [filter],
        ...search,
      });
    });

    it("reads a missing searchType as the id scope", () => {
      for (const searchType of [undefined, null]) {
        expect(
          toFilterState(fromFilterState([], { searchQuery: "x", searchType })),
        ).toEqual({ filter: [], searchQuery: "x", searchType: ["id"] });
      }
    });

    it("rejects a query with an empty searchType, like the search SQL", () => {
      expect(() =>
        fromFilterState([], { searchQuery: "x", searchType: [] }),
      ).toThrow(/At least one search type/);
    });
  });

  describe("write-back of non-flat predicates", () => {
    const condition = fromFilterState([
      sampleFilter.boolean("=") as FilterStateCondition,
    ]).children[0]!;
    const search: Predicate = { kind: "search", text: "x", scopes: ["id"] };

    it("flattens nested conjunctions", () => {
      expect(
        toFilterState({
          kind: "and",
          children: [condition, { kind: "and", children: [search, condition] }],
        }),
      ).toEqual({
        filter: [sampleFilter.boolean("="), sampleFilter.boolean("=")],
        searchQuery: "x",
        searchType: ["id"],
      });
    });

    it.each<[string, Predicate]>([
      ["or", { kind: "or", children: [condition] }],
      ["not", { kind: "not", child: condition }],
      ["two searches", { kind: "and", children: [search, search] }],
    ])("rejects %s", (_, predicate) => {
      expect(() => toFilterState(predicate)).toThrow(
        PredicateNotRepresentableError,
      );
    });
  });
});
