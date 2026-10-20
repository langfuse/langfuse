import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";
import { editExperimentFilter } from "./experimentFilterEditing";

describe("experiment sidebar condition editing", () => {
  const filters: FilterState = [
    {
      column: "scores_avg",
      type: "numberObject",
      key: "quality",
      operator: ">",
      value: 0.8,
      target: "run-a",
    },
    {
      column: "scores_avg",
      type: "numberObject",
      key: "quality",
      operator: "<",
      value: 0.4,
      target: "run-b",
    },
    {
      column: "itemMetadata",
      type: "stringObject",
      key: "region",
      operator: "=",
      value: "eu",
      target: "all",
    },
    {
      column: "eventMetadata",
      type: "stringObject",
      key: "region",
      operator: "=",
      value: "us",
      target: "baseline",
    },
  ];

  it("edits and removes one occurrence without replacing its score or metadata siblings", () => {
    const changed = { ...filters[0], target: "all" };
    expect(editExperimentFilter(filters, 0, changed)).toEqual([
      changed,
      ...filters.slice(1),
    ]);
    expect(editExperimentFilter(filters, 2, null)).toEqual([
      filters[0],
      filters[1],
      filters[3],
    ]);
    const duplicate = [filters[0], filters[0]];
    expect(editExperimentFilter(duplicate, 1, null)).toEqual([filters[0]]);
  });
});
