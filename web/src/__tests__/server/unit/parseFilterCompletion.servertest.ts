import { describe, expect, it } from "vitest";

import {
  type FilterExpression,
  type FilterInput,
  type FilterState,
  MAX_FILTER_EXPRESSION_DEPTH,
} from "@langfuse/shared";
import { parseGeneratedFilters } from "@/src/features/search-bar/server/parseFilterCompletion";

/** Assert the parser took the flat path and narrow for indexing. */
function asFlat(input: FilterInput): FilterState {
  if (!Array.isArray(input)) throw new Error("expected a flat filter array");
  return input;
}

/** Assert the parser took the tree path and narrow for structural checks. */
function asGroup(
  input: FilterInput,
): Extract<FilterExpression, { type: "group" }> {
  if (Array.isArray(input) || input.type !== "group")
    throw new Error("expected a nested group");
  return input;
}

describe("parseGeneratedFilters — flat array (implicit AND)", () => {
  it("parses a plain JSON array of v4 filters and derives query text", () => {
    const completion = JSON.stringify([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
      { type: "number", column: "latency", operator: ">", value: 2 },
    ]);
    const { filterInput, queryText, droppedCount } =
      parseGeneratedFilters(completion);
    expect(asFlat(filterInput)).toHaveLength(2);
    expect(droppedCount).toBe(0);
    expect(queryText).toContain("level");
    expect(queryText).toContain("latency");
  });

  it("tolerates a { filters: [...] } wrapper", () => {
    const completion = JSON.stringify({
      filters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["production"],
        },
      ],
    });
    const { filterInput, droppedCount } = parseGeneratedFilters(completion);
    const filters = asFlat(filterInput);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("environment");
    expect(droppedCount).toBe(0);
  });

  it("extracts the JSON array out of surrounding prose", () => {
    const completion = [
      "Here are the filters you asked for:",
      '[{"type":"number","column":"totalCost","operator":">","value":0.5}]',
      "Hope that helps!",
    ].join("\n");
    const { filterInput } = parseGeneratedFilters(completion);
    const filters = asFlat(filterInput);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("totalCost");
  });

  it("drops hallucinated / non-v4 columns and keeps the representable ones", () => {
    const completion = JSON.stringify([
      // legacy trace columns the v4 grammar can't express:
      { type: "boolean", column: "bookmarked", operator: "=", value: true },
      {
        type: "datetime",
        column: "timestamp",
        operator: ">",
        value: "2026-06-01T00:00:00.000Z",
      },
      // a valid v4 filter:
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    const { filterInput, droppedCount } = parseGeneratedFilters(completion);
    const filters = asFlat(filterInput);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(2);
  });

  it("keeps metadata and score filters (representable in the grammar)", () => {
    const completion = JSON.stringify([
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "=",
        value: "eu",
      },
      {
        type: "numberObject",
        column: "scores_avg",
        key: "accuracy",
        operator: ">",
        value: 0.8,
      },
    ]);
    const { filterInput, droppedCount } = parseGeneratedFilters(completion);
    expect(asFlat(filterInput)).toHaveLength(2);
    expect(droppedCount).toBe(0);
  });

  it("drops a filter whose type is incompatible with the column's contract", () => {
    // The model emitted a plain `number` filter on the score column (it needs
    // `numberObject` with a key) — events.all 500s on this. Drop it; keep the
    // valid sibling.
    const completion = JSON.stringify([
      { type: "number", column: "scores_avg", operator: ">", value: 90 },
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    const { filterInput, droppedCount } = parseGeneratedFilters(completion);
    const filters = asFlat(filterInput);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(1);
  });

  it("keeps a structurally-valid filter when a sibling element is malformed", () => {
    // Weaker models drift on shape. Here element 2 has an operator that isn't in
    // the stringOptions enum ("equals" is not "any of"/"none of"), so it fails
    // `singleFilter`. The whole array must NOT be discarded — the valid
    // level:ERROR filter survives, and the malformed one counts as dropped.
    const completion = JSON.stringify([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
      {
        type: "stringOptions",
        column: "environment",
        operator: "equals",
        value: "production",
      },
    ]);
    const { filterInput, droppedCount } = parseGeneratedFilters(completion);
    const filters = asFlat(filterInput);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(1);
  });

  it("returns no filters for non-JSON / refusal output", () => {
    const { filterInput, queryText, droppedCount } = parseGeneratedFilters(
      "I'm sorry, I can't help with that.",
    );
    expect(asFlat(filterInput)).toHaveLength(0);
    expect(queryText).toBe("");
    expect(droppedCount).toBe(0);
  });

  it("returns no filters for an empty array", () => {
    const { filterInput, droppedCount } = parseGeneratedFilters("[]");
    expect(asFlat(filterInput)).toHaveLength(0);
    expect(droppedCount).toBe(0);
  });
});

describe("parseGeneratedFilters — nested groups (OR / brackets)", () => {
  it("parses a cross-field OR group into a tree and derives `OR` query text", () => {
    const completion = JSON.stringify({
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR"],
        },
        { type: "number", column: "latency", operator: ">", value: 5 },
      ],
    });
    const { filterInput, queryText, droppedCount } =
      parseGeneratedFilters(completion);
    const group = asGroup(filterInput);
    expect(group.operator).toBe("OR");
    expect(group.conditions).toHaveLength(2);
    expect(droppedCount).toBe(0);
    expect(queryText).toContain(" OR ");
  });

  it("preserves bracketing for a mixed AND-of-OR tree", () => {
    const completion = JSON.stringify({
      type: "group",
      operator: "AND",
      conditions: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["production"],
        },
        {
          type: "group",
          operator: "OR",
          conditions: [
            {
              type: "stringOptions",
              column: "level",
              operator: "any of",
              value: ["ERROR"],
            },
            { type: "number", column: "totalCost", operator: ">", value: 1 },
          ],
        },
      ],
    });
    const { filterInput, queryText, droppedCount } =
      parseGeneratedFilters(completion);
    const group = asGroup(filterInput);
    expect(group.operator).toBe("AND");
    expect(droppedCount).toBe(0);
    // OR is parenthesized inside the AND, so the derived text brackets it.
    expect(queryText).toContain(" OR ");
    expect(queryText).toContain("(");
  });

  it("tolerates a { filterInput: {group} } wrapper", () => {
    const completion = JSON.stringify({
      filterInput: {
        type: "group",
        operator: "OR",
        conditions: [
          {
            type: "stringOptions",
            column: "level",
            operator: "any of",
            value: ["ERROR"],
          },
          {
            type: "stringOptions",
            column: "level",
            operator: "any of",
            value: ["WARNING"],
          },
        ],
      },
    });
    const { filterInput } = parseGeneratedFilters(completion);
    expect(asGroup(filterInput).operator).toBe("OR");
  });

  it("rejects the WHOLE tree when any leaf is non-representable (all-or-nothing)", () => {
    // A bare `number` on the score column 500s the events query. Dropping just
    // that leaf would change the OR's meaning, so the whole tree is rejected.
    const completion = JSON.stringify({
      type: "group",
      operator: "OR",
      conditions: [
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR"],
        },
        { type: "number", column: "scores_avg", operator: ">", value: 90 },
      ],
    });
    const { filterInput, droppedCount } = parseGeneratedFilters(completion);
    expect(asFlat(filterInput)).toHaveLength(0);
    expect(droppedCount).toBe(2);
  });

  it("rejects a tree nested beyond the depth bound", () => {
    let node: unknown = {
      type: "string",
      column: "name",
      operator: "=",
      value: "x",
    };
    for (let i = 0; i < MAX_FILTER_EXPRESSION_DEPTH + 1; i++) {
      node = { type: "group", operator: "AND", conditions: [node] };
    }
    const { filterInput } = parseGeneratedFilters(JSON.stringify(node));
    expect(asFlat(filterInput)).toHaveLength(0);
  });

  it("rejects a structurally-invalid group (empty conditions)", () => {
    const completion = JSON.stringify({
      type: "group",
      operator: "AND",
      conditions: [],
    });
    const { filterInput } = parseGeneratedFilters(completion);
    expect(asFlat(filterInput)).toHaveLength(0);
  });
});
