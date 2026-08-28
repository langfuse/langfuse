import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { EVALUATOR_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import {
  fromDatasetNameFilters,
  toDatasetNameFilters,
} from "./datasetNameFilter";

const datasets = [
  { id: "dataset-id-1", name: "Support conversations" },
  { id: "dataset-id-2", name: "Billing: escalations" },
];

describe("dataset name search filters", () => {
  it("projects dataset IDs to names and resolves names back to IDs", () => {
    const persisted = [
      {
        column: "experimentDatasetId",
        type: "stringOptions",
        operator: "any of",
        value: ["dataset-id-1", "dataset-id-2"],
      },
    ] satisfies FilterState;

    const searchable = toDatasetNameFilters(persisted, datasets);

    expect(searchable).toEqual([
      {
        column: "experimentDatasetName",
        type: "stringOptions",
        operator: "any of",
        value: ["Support conversations", "Billing: escalations"],
      },
    ]);
    expect(fromDatasetNameFilters(searchable, datasets)).toEqual(persisted);
  });

  it("keeps filters for deleted datasets lossless", () => {
    const persisted = [
      {
        column: "experimentDatasetId",
        type: "stringOptions",
        operator: "none of",
        value: ["deleted-dataset-id"],
      },
    ] satisfies FilterState;

    expect(toDatasetNameFilters(persisted, datasets)).toEqual(persisted);
  });

  it("maps null checks to the persisted dataset ID column", () => {
    const searchable = [
      {
        column: "experimentDatasetName",
        type: "null",
        operator: "is not null",
      },
    ] satisfies FilterState;

    expect(fromDatasetNameFilters(searchable, datasets)).toEqual([
      {
        column: "experimentDatasetId",
        type: "null",
        operator: "is not null",
      },
    ]);
  });

  it("accepts dataset names in evaluator and rule search queries", () => {
    for (const registry of [EVALUATOR_FIELD_REGISTRY, RULE_FIELD_REGISTRY]) {
      const result = planCommit(
        'experimentDatasetName:"Support conversations"',
        undefined,
        registry,
      );

      expect(result.status).toBe("committed");
      if (result.status !== "committed") continue;

      expect(fromDatasetNameFilters(result.filters, datasets)).toEqual([
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-id-1"],
        },
      ]);
    }
  });

  it("quotes dataset names containing grammar characters", () => {
    const searchable = toDatasetNameFilters(
      [
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-id-2"],
        },
      ],
      datasets,
    );

    expect(
      filterStateToQueryText(searchable, {}, EVALUATOR_FIELD_REGISTRY).text,
    ).toBe('experimentDatasetName:"Billing: escalations"');
  });
});
