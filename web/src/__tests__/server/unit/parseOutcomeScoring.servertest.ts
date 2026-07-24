import { describe, expect, it } from "vitest";

import { deriveParseOutcomeScores } from "@/src/features/search-bar/server/parseOutcomeScoring";
import type { GeneratedFilters } from "@/src/features/search-bar/server/parseFilterCompletion";

// Only `.length` of `filters` matters to the derivation, so a loosely-typed
// stand-in keeps these cases focused on the outcome shape rather than real
// `FilterState` entries (already covered by parseFilterCompletion.servertest.ts).
function fakeFilters(count: number): GeneratedFilters["filters"] {
  return Array.from(
    { length: count },
    () => ({}) as GeneratedFilters["filters"][number],
  );
}

describe("deriveParseOutcomeScores", () => {
  it("scores a clean, well-formed answer with no fences", () => {
    const raw =
      '[{"type":"number","column":"latency","operator":">","value":2}]';
    const scores = deriveParseOutcomeScores(raw, {
      filters: fakeFilters(1),
      queryText: "latency > 2",
      droppedCount: 0,
      unknownScoreNames: [],
    });

    expect(scores).toEqual([
      { name: "parse-empty-result", dataType: "BOOLEAN", value: 0 },
      { name: "parse-dropped-filters", dataType: "NUMERIC", value: 0 },
      { name: "parse-unknown-score-names", dataType: "NUMERIC", value: 0 },
      {
        name: "filter-count",
        dataType: "NUMERIC",
        value: 1,
        comment: "latency > 2",
      },
      { name: "output-markdown-fenced", dataType: "BOOLEAN", value: 0 },
    ]);
  });

  it("flags the couldn't-build-filters outcome (empty result)", () => {
    const raw = "[]";
    const scores = deriveParseOutcomeScores(raw, {
      filters: fakeFilters(0),
      queryText: "",
      droppedCount: 0,
      unknownScoreNames: [],
    });

    const empty = scores.find((s) => s.name === "parse-empty-result");
    const count = scores.find((s) => s.name === "filter-count");
    expect(empty).toEqual({
      name: "parse-empty-result",
      dataType: "BOOLEAN",
      value: 1,
    });
    // No filters => no query text => no comment attached.
    expect(count).toEqual({
      name: "filter-count",
      dataType: "NUMERIC",
      value: 0,
      comment: undefined,
    });
  });

  it("detects a ```-fenced raw completion even when parsing recovered", () => {
    const raw = [
      "```json",
      '[{"type":"number","column":"latency","operator":">","value":2}]',
      "```",
    ].join("\n");
    const scores = deriveParseOutcomeScores(raw, {
      filters: fakeFilters(1),
      queryText: "latency > 2",
      droppedCount: 0,
      unknownScoreNames: [],
    });

    expect(scores.find((s) => s.name === "output-markdown-fenced")).toEqual({
      name: "output-markdown-fenced",
      dataType: "BOOLEAN",
      value: 1,
    });
  });

  it("reports dropped filters and unknown score names as counts", () => {
    const raw =
      '[{"type":"numberObject","column":"scores_avg","key":"my_score","operator":">","value":1}]';
    const scores = deriveParseOutcomeScores(raw, {
      filters: fakeFilters(0),
      queryText: "",
      droppedCount: 1,
      unknownScoreNames: ["my_score"],
    });

    expect(scores.find((s) => s.name === "parse-dropped-filters")).toEqual({
      name: "parse-dropped-filters",
      dataType: "NUMERIC",
      value: 1,
    });
    expect(scores.find((s) => s.name === "parse-unknown-score-names")).toEqual({
      name: "parse-unknown-score-names",
      dataType: "NUMERIC",
      value: 1,
    });
  });

  it("truncates a very long applied query text on the filter-count comment", () => {
    const longQuery = "level = ERROR OR ".repeat(50) + "level = ERROR";
    const scores = deriveParseOutcomeScores("[]", {
      filters: fakeFilters(3),
      queryText: longQuery,
      droppedCount: 0,
      unknownScoreNames: [],
    });

    const filterCount = scores.find((s) => s.name === "filter-count");
    expect(filterCount?.comment?.length).toBeLessThanOrEqual(500);
    expect(longQuery.length).toBeGreaterThan(500);
  });
});
