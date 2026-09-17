import { describe, expect, it } from "vitest";
import { EXPERIMENT_ITEMS_FIELD_REGISTRY } from "./experimentItemsSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { hasAmbiguousTargetChange } from "@/src/features/experiments/lib/reconcileFilterTargets";
import type { FilterState } from "@langfuse/shared";

describe("experiment item search contract", () => {
  it("lowers root/trace score conditions to the same canonical columns as the sidebar", () => {
    const result = planCommit(
      "status:ERROR scores.quality:>0.8",
      undefined,
      EXPERIMENT_ITEMS_FIELD_REGISTRY,
    );
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
        {
          column: "scores_avg",
          type: "numberObject",
          key: "quality",
          operator: ">",
          value: 0.8,
        },
      ],
    });
  });
  it("preserves backend-specific metadata filters without emitting a generic metadata column", () => {
    const filters: FilterState = [
      {
        column: "itemMetadata",
        type: "stringObject",
        key: "language",
        operator: "=",
        value: "en",
      },
      {
        column: "eventMetadata",
        type: "stringObject",
        key: "model",
        operator: "=",
        value: "test",
      },
    ];
    expect(
      filterStateToQueryText(
        filters,
        undefined,
        EXPERIMENT_ITEMS_FIELD_REGISTRY,
      ).skippedFilters,
    ).toEqual(filters);
    expect(
      planCommit(
        "metadata.language:en",
        undefined,
        EXPERIMENT_ITEMS_FIELD_REGISTRY,
      ).status,
    ).toBe("invalid");
    expect(
      planCommit(
        "traceScores.quality:1",
        undefined,
        EXPERIMENT_ITEMS_FIELD_REGISTRY,
      ).status,
    ).toBe("invalid");
  });
  it("checks target ambiguity over the whole query, allowing unchanged duplicate conditions", () => {
    const filters: FilterState = [
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
    ];
    const registry = {
      ...EXPERIMENT_ITEMS_FIELD_REGISTRY,
      filterStateErrors: (next: FilterState) =>
        hasAmbiguousTargetChange(filters, next, { 0: "a", 1: "b" }, "a")
          ? ["Ambiguous target"]
          : [],
    };
    expect(
      planCommit("level:ERROR level:ERROR", undefined, registry).status,
    ).toBe("committed");
    expect(planCommit("level:ERROR", undefined, registry).status).toBe(
      "invalid",
    );
    expect(planCommit("", undefined, registry).status).toBe("committed");
  });
});
