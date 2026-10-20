import type { FilterState } from "@langfuse/shared";
import {
  getExperimentBatchEvaluationFilters,
  groupExperimentFilters,
} from "./experimentFilterTargets";

const quality = {
  column: "scores_avg",
  type: "numberObject",
  key: "quality",
  operator: ">",
  value: 0.8,
} satisfies FilterState[number];

describe("experiment filter request groups", () => {
  it("applies All to every selected experiment alongside its own conditions", () => {
    const status = {
      column: "level",
      type: "stringOptions",
      operator: "any of",
      value: ["ERROR"],
    } satisfies FilterState[number];
    expect(
      groupExperimentFilters(
        [
          { ...quality, target: "all" },
          { ...status, target: "b" },
        ],
        "a",
        ["a", "b", "c"],
      ),
    ).toEqual({
      groups: [
        { runId: "a", filters: [quality] },
        { runId: "b", filters: [quality, status] },
        { runId: "c", filters: [quality] },
      ],
    });
  });

  it("keeps explicit targets fixed and legacy filters on baseline or first comparison", () => {
    expect(groupExperimentFilters([quality], "b", ["a", "b"]).groups).toEqual([
      { runId: "b", filters: [quality] },
    ]);
    expect(
      groupExperimentFilters([{ ...quality, target: "a" }], "b", ["a", "b"])
        .groups,
    ).toEqual([{ runId: "a", filters: [quality] }]);
    expect(groupExperimentFilters([quality], undefined, ["b", "a"])).toEqual({
      groups: [{ runId: "b", filters: [quality] }],
    });
  });

  it("expands All against the current selection as runs are added and removed", () => {
    const filters = [{ ...quality, target: "all" }];
    expect(groupExperimentFilters(filters, undefined, ["a"]).groups).toEqual([
      { runId: "a", filters: [quality] },
    ]);
    expect(
      groupExperimentFilters(filters, undefined, ["a", "b"]).groups,
    ).toEqual([
      { runId: "a", filters: [quality] },
      { runId: "b", filters: [quality] },
    ]);
    expect(groupExperimentFilters(filters, undefined, ["b"]).groups).toEqual([
      { runId: "b", filters: [quality] },
    ]);
  });

  it("blocks unavailable targets without sending a partial filter set", () => {
    expect(
      groupExperimentFilters(
        [
          { ...quality, target: "all" },
          { ...quality, target: "missing" },
        ],
        "a",
        ["a"],
      ),
    ).toMatchObject({ groups: [], error: expect.any(String) });
    expect(
      groupExperimentFilters([{ ...quality, target: "baseline" }], undefined, [
        "a",
      ]).error,
    ).toBeDefined();
  });
});

describe("experiment batch evaluation filters", () => {
  it("blocks select-all for differing conditions but allows explicit rows or a common filter", () => {
    const groups = [{ runId: "a", filters: [quality] }];
    expect(
      getExperimentBatchEvaluationFilters(groups, ["a", "b"], true),
    ).toBeNull();
    expect(
      getExperimentBatchEvaluationFilters(groups, ["a", "b"], false),
    ).toEqual([]);
    expect(
      getExperimentBatchEvaluationFilters(
        [...groups, { runId: "b", filters: [{ ...quality }] }],
        ["a", "b"],
        true,
      ),
    ).toEqual([quality]);
  });
});
