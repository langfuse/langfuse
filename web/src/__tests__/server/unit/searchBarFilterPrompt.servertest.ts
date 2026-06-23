import { describe, expect, it } from "vitest";

import { type FilterState } from "@langfuse/shared";
import {
  FIELDS,
  SCORE_COLUMNS,
  type FieldDef,
} from "@/src/features/search-bar/lib/fields";
import {
  buildFilterSystemPrompt,
  specForField,
} from "@/src/features/search-bar/server/buildFilterPrompt";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";

// A representative `singleFilter` for the FilterState `type` the prompt tells
// the model to emit for this field. Used to assert the prompt's per-field
// recommendation lowers back to bar grammar — i.e. it can't drift from the
// reverse adapter.
function sampleFilterFor(field: FieldDef): FilterState[number] {
  const { type } = specForField(field);
  switch (type) {
    case "number":
      return { type: "number", column: field.id, operator: ">", value: 1 };
    case "datetime":
      return {
        type: "datetime",
        column: field.id,
        operator: ">",
        value: new Date("2026-06-01T00:00:00.000Z"),
      };
    case "boolean":
      return { type: "boolean", column: field.id, operator: "=", value: true };
    case "stringOptions":
      return {
        type: "stringOptions",
        column: field.id,
        operator: "any of",
        value: ["x"],
      };
    case "arrayOptions":
      return {
        type: "arrayOptions",
        column: field.id,
        operator: "any of",
        value: ["x"],
      };
    default:
      return {
        type: "string",
        column: field.id,
        operator: "contains",
        value: "x",
      };
  }
}

describe("buildFilterSystemPrompt", () => {
  const prompt = buildFilterSystemPrompt("Monday, 2026-06-15T00:00:00.000Z");

  it("lists every registry field id", () => {
    for (const f of FIELDS) expect(prompt).toContain(f.id);
  });

  it("anchors relative time to the current datetime", () => {
    expect(prompt).toContain("2026-06-15T00:00:00.000Z");
  });

  it("documents metadata and observation/trace score columns", () => {
    expect(prompt).toContain("metadata");
    expect(prompt).toContain(SCORE_COLUMNS.observation.numeric);
    expect(prompt).toContain(SCORE_COLUMNS.observation.categorical);
    expect(prompt).toContain(SCORE_COLUMNS.trace.numeric);
    expect(prompt).toContain(SCORE_COLUMNS.trace.categorical);
  });

  it("omits the refine section without a current query", () => {
    expect(prompt).not.toContain("Current filters (refine these)");
  });

  it("includes the current query as refine context when provided", () => {
    const refinePrompt = buildFilterSystemPrompt(
      "Monday, 2026-06-15T00:00:00.000Z",
      "environment:production level:ERROR",
    );
    expect(refinePrompt).toContain("Current filters (refine these)");
    expect(refinePrompt).toContain("environment:production level:ERROR");
  });
});

describe("prompt field specs round-trip to bar grammar", () => {
  it.each(FIELDS.map((f) => [f.id, f] as const))(
    "%s lowers to a representable filter (no drift vs reverse adapter)",
    (_id, field) => {
      const { skippedFilters } = filterStateToQueryText([
        sampleFilterFor(field),
      ]);
      expect(skippedFilters).toHaveLength(0);
    },
  );
});

describe("metadata and score filters are representable", () => {
  it("metadata stringObject", () => {
    const { skippedFilters } = filterStateToQueryText([
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "=",
        value: "eu",
      },
    ]);
    expect(skippedFilters).toHaveLength(0);
  });

  it("numeric observation score", () => {
    const { skippedFilters } = filterStateToQueryText([
      {
        type: "numberObject",
        column: SCORE_COLUMNS.observation.numeric,
        key: "accuracy",
        operator: ">",
        value: 0.8,
      },
    ]);
    expect(skippedFilters).toHaveLength(0);
  });

  it("categorical observation score", () => {
    const { skippedFilters } = filterStateToQueryText([
      {
        type: "categoryOptions",
        column: SCORE_COLUMNS.observation.categorical,
        key: "sentiment",
        operator: "any of",
        value: ["positive"],
      },
    ]);
    expect(skippedFilters).toHaveLength(0);
  });
});
