import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";
import {
  completeExperimentFilter,
  editExperimentFilter,
  experimentFilterToDraft,
  newExperimentFilterDraft,
} from "./experimentFilterEditing";

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

  it("defaults new drafts to all while preserving legacy baseline and fixed targets", () => {
    expect(newExperimentFilterDraft("level").target).toBe("all");
    expect(
      experimentFilterToDraft({ ...filters[0], target: undefined }).target,
    ).toBe("baseline");
    expect(experimentFilterToDraft(filters[0]).target).toBe("run-a");
    expect(
      experimentFilterToDraft({ ...filters[0], target: undefined }, "run-b")
        .target,
    ).toBe("run-b");
  });

  it("retains explicit scope and both metadata namespaces when completing a draft", () => {
    for (const filter of filters)
      expect(completeExperimentFilter(experimentFilterToDraft(filter))).toEqual(
        filter,
      );
    expect(
      completeExperimentFilter({
        ...newExperimentFilterDraft("itemMetadata"),
        key: "region",
        operator: "is not set",
      }),
    ).toEqual({
      column: "itemMetadata",
      type: "stringObject",
      key: "region",
      operator: "is not set",
      value: "",
      target: "all",
    });
  });

  it("does not persist incomplete scores, metadata, empty selections, or non-finite values", () => {
    for (const column of [
      "level",
      "scores_avg",
      "score_categories",
      "score_booleans",
      "itemMetadata",
    ])
      expect(
        completeExperimentFilter(newExperimentFilterDraft(column)),
      ).toBeNull();
    expect(
      completeExperimentFilter({
        ...newExperimentFilterDraft("scores_avg"),
        key: "quality",
        value: "Infinity",
      }),
    ).toBeNull();
    expect(
      completeExperimentFilter({
        ...newExperimentFilterDraft("scores_avg"),
        key: "quality",
        value: "0",
      })?.value,
    ).toBe(0);
    expect(
      completeExperimentFilter({
        ...newExperimentFilterDraft("score_booleans"),
        key: "correct",
        value: "false",
      })?.value,
    ).toBe(false);
  });
});
