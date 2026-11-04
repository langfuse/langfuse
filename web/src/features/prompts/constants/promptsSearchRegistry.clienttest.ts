import { describe, expect, it } from "vitest";
import { PROMPTS_FIELD_REGISTRY } from "./promptsSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";

describe("prompt search contract", () => {
  it("round trips the sidebar filters alongside the existing free-text lane", () => {
    const result = planCommit(
      'type:chat label:production tags:(support AND qa) version:>1 "refund policy"',
      undefined,
      PROMPTS_FIELD_REGISTRY,
    );
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.searchQuery).toBe("refund policy");
    expect(result.filters).toEqual([
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["chat"],
      },
      {
        column: "labels",
        type: "arrayOptions",
        operator: "any of",
        value: ["production"],
      },
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["support", "qa"],
      },
      { column: "version", type: "number", operator: ">", value: 1 },
    ]);
    const roundTrip = filterStateToQueryText(
      result.filters,
      { searchQuery: result.searchQuery, searchType: result.searchType },
      PROMPTS_FIELD_REGISTRY,
    );
    expect(roundTrip.skippedFilters).toEqual([]);
    expect(
      planCommit(roundTrip.text, undefined, PROMPTS_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: result.filters,
      searchQuery: "refund policy",
    });
  });
  it.each([
    "name:test",
    "input:test",
    "output:test",
    "metadata.foo:bar",
    "scores.quality:1",
  ])(
    "does not author a structured filter outside the prompt sidebar: %s",
    (query) => {
      expect(planCommit(query, undefined, PROMPTS_FIELD_REGISTRY).status).toBe(
        "invalid",
      );
    },
  );
});
