import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";
import {
  reconcileFilterTargets,
  hasAmbiguousTargetChange,
} from "./reconcileFilterTargets";

const previous: FilterState = [
  {
    type: "stringOptions",
    column: "level",
    operator: "any of",
    value: ["ERROR"],
  },
  {
    type: "numberObject",
    column: "scores_avg",
    key: "quality",
    operator: ">",
    value: 0.5,
  },
  {
    type: "numberObject",
    column: "scores_avg",
    key: "safety",
    operator: "<",
    value: 0.8,
  },
];

describe("experiment filter targets", () => {
  const scoreRange: FilterState = [
    {
      type: "numberObject",
      column: "scores_avg",
      key: "quality",
      operator: ">",
      value: 0.5,
    },
    {
      type: "numberObject",
      column: "scores_avg",
      key: "quality",
      operator: "<",
      value: 0.8,
    },
  ];
  const editedScoreRange: FilterState = [
    {
      type: "numberObject",
      column: "scores_avg",
      key: "quality",
      operator: ">",
      value: 0.6,
    },
    {
      type: "numberObject",
      column: "scores_avg",
      key: "quality",
      operator: "<",
      value: 0.9,
    },
  ];

  it("rejects ambiguous edits of the same score across different runs", () => {
    expect(
      hasAmbiguousTargetChange(
        scoreRange,
        editedScoreRange,
        {
          0: "comparison-a",
          1: "comparison-b",
        },
        "baseline",
      ),
    ).toBe(true);
  });

  it("preserves a common run when multiple conditions change together", () => {
    const targets = { 0: "comparison-a", 1: "comparison-a" };
    expect(
      hasAmbiguousTargetChange(
        scoreRange,
        editedScoreRange,
        targets,
        "baseline",
      ),
    ).toBe(false);
    expect(
      reconcileFilterTargets(scoreRange, editedScoreRange, targets),
    ).toEqual(targets);
  });

  it("keeps a run's condition on that run when the bar reorders and removes other filters", () => {
    const next = [structuredClone(previous[2]!), structuredClone(previous[0]!)];
    expect(
      reconcileFilterTargets(previous, next, {
        0: "baseline",
        1: "comparison-a",
        2: "comparison-b",
      }),
    ).toEqual({
      0: "comparison-b",
      1: "baseline",
    });
  });
  it("preserves the target of a uniquely edited score and defaults newly added fields", () => {
    const next: FilterState = [
      { ...previous[1]!, value: 0.9 } as FilterState[number],
      {
        type: "booleanObject",
        column: "score_booleans",
        key: "approved",
        operator: "=",
        value: true,
      },
    ];
    expect(
      reconcileFilterTargets(previous, next, {
        1: "comparison-a",
        2: "comparison-b",
      }),
    ).toEqual({ 0: "comparison-a" });
  });
  it("uses retained object identity when a targeted pill removes one of two identical conditions", () => {
    const first = structuredClone(previous[0]!);
    const second = structuredClone(previous[0]!);
    expect(
      reconcileFilterTargets([first, second], [second], { 0: "a", 1: "b" }),
    ).toEqual({ 0: "b" });
    expect(
      hasAmbiguousTargetChange(
        [first, second],
        [structuredClone(second)],
        { 0: "a", 1: "b" },
        "baseline",
      ),
    ).toBe(true);
    expect(
      hasAmbiguousTargetChange(
        [first, second],
        [],
        { 0: "a", 1: "b" },
        "baseline",
      ),
    ).toBe(false);
  });
});
