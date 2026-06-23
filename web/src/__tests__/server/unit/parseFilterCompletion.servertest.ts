import { describe, expect, it } from "vitest";

import { parseGeneratedFilters } from "@/src/features/search-bar/server/parseFilterCompletion";

describe("parseGeneratedFilters", () => {
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
    const { filters, queryText, droppedCount } =
      parseGeneratedFilters(completion);
    expect(filters).toHaveLength(2);
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
    const { filters, droppedCount } = parseGeneratedFilters(completion);
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
    const { filters } = parseGeneratedFilters(completion);
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
    const { filters, droppedCount } = parseGeneratedFilters(completion);
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
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(2);
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
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(1);
  });

  it("returns no filters for non-JSON / refusal output", () => {
    const { filters, queryText, droppedCount } = parseGeneratedFilters(
      "I'm sorry, I can't help with that.",
    );
    expect(filters).toHaveLength(0);
    expect(queryText).toBe("");
    expect(droppedCount).toBe(0);
  });

  it("returns no filters for an empty array", () => {
    const { filters, droppedCount } = parseGeneratedFilters("[]");
    expect(filters).toHaveLength(0);
    expect(droppedCount).toBe(0);
  });
});
