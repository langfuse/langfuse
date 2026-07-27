import { describe, expect, it } from "vitest";

import { type FilterState } from "@langfuse/shared";
import {
  FIELDS,
  SCORE_COLUMNS,
  type FieldDef,
} from "@/src/features/search-bar/lib/fields";
import {
  buildFilterContextMessage,
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
    expect(prompt).toContain(SCORE_COLUMNS.observation.boolean);
    expect(prompt).toContain(SCORE_COLUMNS.trace.numeric);
    expect(prompt).toContain(SCORE_COLUMNS.trace.categorical);
    expect(prompt).toContain(SCORE_COLUMNS.trace.boolean);
  });

  it("contains the refine RULES, but never the injected VALUES", () => {
    // The refinement rules ("KEEP every existing filter...", the worked
    // example) are instructions on HOW to use current filters, not the
    // filters themselves — they belong in the system prompt so a later user
    // turn (the actual request) can never outrank them. Only the injected,
    // per-request VALUES (the query text being refined, observed project
    // data) live in `buildFilterContextMessage`'s own message.
    expect(prompt).toContain("## Refining existing filters");
    expect(prompt).toContain("KEEP every existing filter");
    expect(prompt).toContain(
      '[{"type":"stringOptions","column":"level","operator":"any of","value":["ERROR"]},{"type":"stringOptions","column":"environment","operator":"any of","value":["production"]}]',
    );
    // No injected VALUES (nor the headings that only ever wrap a VALUE) ever
    // appear in the static skeleton.
    expect(prompt).not.toContain("## Current filters");
    expect(prompt).not.toContain("## Observed project data");
  });

  it("no longer accepts currentQuery/dataContext — single-datetime signature", () => {
    // Regression guard for the detangle: the skeleton takes only the anchor
    // datetime now, so passing extra args would be a silent no-op if the
    // signature ever regained them without a type error surfacing here.
    expect(buildFilterSystemPrompt.length).toBe(1);
  });
});

describe("buildFilterContextMessage", () => {
  it("returns null when neither current query nor data context is given", () => {
    expect(buildFilterContextMessage()).toBeNull();
    expect(buildFilterContextMessage("", "")).toBeNull();
    expect(buildFilterContextMessage("   ", undefined)).toBeNull();
  });

  it("includes the current query as a bare VALUE, no refine RULES", () => {
    const message = buildFilterContextMessage(
      "environment:production level:ERROR",
    );
    expect(message).not.toBeNull();
    expect(message).toContain("## Current filters");
    expect(message).toContain("environment:production level:ERROR");
    // The refine RULES (why/how to keep existing filters) now live only in
    // the system prompt — this message must never re-state them, or a later
    // user turn (the actual request) could again outrank them.
    expect(message).not.toContain("KEEP every existing filter");
    expect(message).not.toContain("ON TOP OF the current ones");
    expect(message).not.toContain("Worked example");
    // No data context was given, so that section should be absent.
    expect(message).not.toContain("Observed project data");
  });

  it("includes observed project data as a bare VALUE, no usage RULES", () => {
    const message = buildFilterContextMessage(
      undefined,
      "metadata keys: routing.queue, tenant",
    );
    expect(message).not.toBeNull();
    expect(message).toContain("## Observed project data");
    expect(message).toContain("metadata keys: routing.queue, tenant");
    expect(message).not.toContain("Current filters");
    // The usage rule ("map the request to what ACTUALLY appears...") now
    // lives in the system prompt.
    expect(message).not.toContain("ACTUALLY appear");
  });

  it("includes both sections, refine before data, when both are provided", () => {
    const message = buildFilterContextMessage(
      "level:ERROR",
      "metadata keys: routing.queue",
    );
    expect(message).not.toBeNull();
    expect(message).toContain("## Current filters");
    expect(message).toContain("## Observed project data");
    expect(message!.indexOf("Current filters")).toBeLessThan(
      message!.indexOf("Observed project data"),
    );
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

  it("boolean observation and trace scores", () => {
    const { skippedFilters, text } = filterStateToQueryText([
      {
        type: "booleanObject",
        column: SCORE_COLUMNS.observation.boolean,
        key: "flag",
        operator: "=",
        value: true,
      },
      {
        type: "booleanObject",
        column: SCORE_COLUMNS.trace.boolean,
        key: "traceFlag",
        operator: "<>",
        value: false,
      },
    ]);

    expect(skippedFilters).toHaveLength(0);
    expect(text).toBe("scores.flag:true -traceScores.traceFlag:false");
  });
});
