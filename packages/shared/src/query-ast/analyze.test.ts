import { describe, expect, it } from "vitest";
import { analyzePredicate } from "./analyze";
import { fromFilterState, type FilterStateCondition } from "./filterStateCodec";
import type { Predicate } from "./predicate";
import { eventsPredicateSource } from "./sources";

const eq = (column: string, value: string): FilterStateCondition => ({
  type: "string",
  column,
  operator: "=",
  value,
});
const anyOf = (column: string, value: string[]): FilterStateCondition => ({
  type: "stringOptions",
  column,
  operator: "any of",
  value,
});
const where = (filter: FilterStateCondition[]) =>
  fromFilterState({ filter }).predicate;
const analyze = (predicate: Predicate) =>
  analyzePredicate(predicate, eventsPredicateSource);

describe("analyzePredicate", () => {
  it("flags disjoint equalities on the same field", () => {
    const predicate = where([eq("userId", "a"), eq("userId", "b")]);
    expect(analyze(predicate)).toEqual([
      {
        kind: "contradiction",
        fieldId: "userId",
        conditions: predicate.children,
      },
    ]);
  });

  it("unifies column aliases and labels with the field id", () => {
    expect(
      analyze(where([anyOf("level", ["ERROR"]), eq("Level", "DEBUG")])),
    ).toEqual([expect.objectContaining({ fieldId: "level" })]);
    expect(
      analyze(where([eq("User ID", "a"), eq("userId", "b")])),
    ).toHaveLength(1);
  });

  it("intersects `any of` sets across conjuncts", () => {
    expect(
      analyze(where([anyOf("name", ["a", "b"]), anyOf("name", ["b", "c"])])),
    ).toEqual([]);
    expect(
      analyze(
        where([
          anyOf("name", ["a", "b"]),
          anyOf("name", ["b", "c"]),
          eq("name", "c"),
        ]),
      ),
    ).toEqual([expect.objectContaining({ fieldId: "name" })]);
  });

  it("flags number and boolean equalities", () => {
    expect(
      analyze(
        where([
          {
            type: "number",
            column: "promptVersion",
            operator: "=",
            value: 1,
          },
          {
            type: "number",
            column: "promptVersion",
            operator: "=",
            value: 2,
          },
          {
            type: "boolean",
            column: "hasInput",
            operator: "=",
            value: true,
          },
          {
            type: "boolean",
            column: "hasInput",
            operator: "=",
            value: false,
          },
        ]),
      ).map((d) => d.fieldId),
    ).toEqual(["promptVersion", "hasInput"]);
  });

  it.each<[string, FilterStateCondition[]]>([
    ["equal values", [eq("userId", "a"), eq("userId", "a")]],
    ["different fields", [eq("userId", "a"), eq("sessionId", "b")]],
    [
      "non-equality operators",
      [
        eq("userId", "a"),
        { type: "string", column: "userId", operator: "contains", value: "b" },
      ],
    ],
    [
      "`none of`",
      [
        anyOf("name", ["a"]),
        {
          type: "stringOptions",
          column: "name",
          operator: "none of",
          value: ["a"],
        },
      ],
    ],
    // Array, keyed, and score fields hold several values per row.
    ["array fields", [anyOf("traceTags", ["a"]), anyOf("traceTags", ["b"])]],
    [
      "keyed fields",
      [
        {
          type: "stringObject",
          column: "metadata",
          key: "k",
          operator: "=",
          value: "a",
        },
        {
          type: "stringObject",
          column: "metadata",
          key: "k",
          operator: "=",
          value: "b",
        },
      ],
    ],
    ["unknown fields", [eq("unknownColumn", "a"), eq("unknownColumn", "b")]],
    // A row can have several comments, and `=` matches each by substring.
    [
      "comment content",
      [eq("commentContent", "foo"), eq("commentContent", "bar")],
    ],
    [
      "conditions on different targets",
      [
        { ...eq("userId", "a"), target: "run-a" },
        { ...eq("userId", "b"), target: "run-b" },
      ],
    ],
    // The filter compiler rejects these; they are not contradictions.
    ["ill-typed conditions", [eq("hasInput", "a"), eq("hasInput", "b")]],
  ])("does not flag %s", (_, filters) => {
    expect(analyze(where(filters))).toEqual([]);
  });

  it("flags disjoint equalities on the same target", () => {
    expect(
      analyze(
        where([
          { ...eq("userId", "a"), target: "run-a" },
          { ...eq("userId", "b"), target: "run-a" },
        ]),
      ),
    ).toHaveLength(1);
  });

  describe("reports only when the whole predicate matches no row", () => {
    const [a, b, c] = where([
      eq("userId", "a"),
      eq("userId", "b"),
      eq("sessionId", "c"),
    ]).children;
    const dead: Predicate = { kind: "and", children: [a!, b!] };

    it("flattens nested conjunctions", () => {
      expect(
        analyze({
          kind: "and",
          children: [a!, { kind: "and", children: [b!] }],
        }),
      ).toHaveLength(1);
    });

    it("ignores a dead branch of a satisfiable `or`", () => {
      expect(
        analyze({
          kind: "and",
          children: [c!, { kind: "or", children: [dead, c!] }],
        }),
      ).toEqual([]);
      expect(analyze({ kind: "or", children: [a!, b!] })).toEqual([]);
    });

    it("reports an `or` whose every branch is dead", () => {
      expect(
        analyze({
          kind: "and",
          children: [c!, { kind: "or", children: [dead, dead] }],
        }),
      ).toHaveLength(2);
    });

    it("does not look under `not`, where a contradiction matches every row", () => {
      expect(analyze({ kind: "not", child: dead })).toEqual([]);
    });
  });
});
