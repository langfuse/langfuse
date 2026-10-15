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

  it("keeps legacy targetless filters on baseline and follows baseline changes", () => {
    expect(groupExperimentFilters([quality], "b", ["a", "b"]).groups).toEqual([
      { runId: "b", filters: [quality] },
    ]);
    expect(
      groupExperimentFilters([{ ...quality, target: "a" }], "b", ["a", "b"])
        .groups,
    ).toEqual([{ runId: "a", filters: [quality] }]);
  });

  it("supports All without a baseline and includes newly selected runs", () => {
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
      groupExperimentFilters([quality], undefined, ["a"]).error,
    ).toBeDefined();
  });
});

describe("experiment batch evaluation filters", () => {
  it("uses explicit observation IDs without reapplying another run's condition", () => {
    expect(
      getExperimentBatchEvaluationFilters(
        [{ runId: "a", filters: [quality] }],
        ["a", "b"],
        false,
      ),
    ).toEqual([]);
  });

  it("blocks select-all when experiments have different conditions", () => {
    expect(
      getExperimentBatchEvaluationFilters(
        [{ runId: "a", filters: [quality] }],
        ["a", "b"],
        true,
      ),
    ).toBeNull();
  });

  it("keeps one shared filter set for select-all instead of duplicating All", () => {
    expect(
      getExperimentBatchEvaluationFilters(
        [
          { runId: "a", filters: [quality] },
          { runId: "b", filters: [{ ...quality }] },
        ],
        ["a", "b"],
        true,
      ),
    ).toEqual([quality]);
    expect(getExperimentBatchEvaluationFilters([], ["a", "b"], true)).toEqual(
      [],
    );
  });
});
