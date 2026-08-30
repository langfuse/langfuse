import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  EVALUATOR_FIELD_REGISTRY,
  RULE_SAMPLE_FIELD_REGISTRY,
} from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { withFieldAllowedValues } from "@/src/features/search-bar/lib/fields";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import {
  addDatasetNameObservedOptions,
  fromDatasetNameFilters,
  toDatasetNameFilters,
} from "./datasetNameFilter";

const datasets = [
  { id: "dataset-id-1", name: "Support conversations" },
  { id: "dataset-id-2", name: "Billing: escalations" },
];

describe("dataset name search filters", () => {
  it("uses dedicated AI-aware sample-filter registries", () => {
    expect(EVALUATOR_FIELD_REGISTRY).toMatchObject({
      id: "evaluatorSamples",
      aiFilterPrompt: true,
      aiContextFields: expect.arrayContaining([
        {
          observedOptionsKey: "datasetName",
          promptLabel: "datasetName",
        },
      ]),
    });
    expect(RULE_SAMPLE_FIELD_REGISTRY).toMatchObject({
      id: "ruleSamples",
      aiFilterPrompt: true,
      aiContextFields: expect.arrayContaining([
        {
          observedOptionsKey: "datasetName",
          promptLabel: "datasetName",
        },
      ]),
    });
  });

  it("preserves the search bar's pending observed-options state", () => {
    expect(addDatasetNameObservedOptions(undefined, datasets)).toBeUndefined();
    expect(addDatasetNameObservedOptions({}, datasets)).toMatchObject({
      datasetName: [
        { value: "Support conversations" },
        { value: "Billing: escalations" },
      ],
    });
  });

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
        column: "datasetName",
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

  it("round-trips dataset presence filters through the name column", () => {
    const searchable = [
      {
        column: "datasetName",
        type: "null",
        operator: "is not null",
        value: "",
      },
    ] satisfies FilterState;

    const persisted = [
      {
        column: "experimentDatasetId",
        type: "null",
        operator: "is not null",
        value: "",
      },
    ] satisfies FilterState;

    expect(fromDatasetNameFilters(searchable, datasets)).toEqual(persisted);
    expect(toDatasetNameFilters(persisted, datasets)).toEqual(searchable);
  });

  it("accepts dataset names in evaluator and rule search queries", () => {
    for (const registry of [
      EVALUATOR_FIELD_REGISTRY,
      RULE_SAMPLE_FIELD_REGISTRY,
    ]) {
      const registryWithDatasets = withFieldAllowedValues(
        registry,
        "datasetName",
        new Set(datasets.map((dataset) => dataset.name)),
      );
      const result = planCommit(
        'datasetName:"Support conversations"',
        undefined,
        registryWithDatasets,
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

  it("rejects unresolved dataset names instead of persisting them as IDs", () => {
    const registry = withFieldAllowedValues(
      EVALUATOR_FIELD_REGISTRY,
      "datasetName",
      new Set(datasets.map((dataset) => dataset.name)),
    );
    const result = planCommit(
      'datasetName:"Missing dataset"',
      undefined,
      registry,
    );

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: '"Missing dataset" is not a valid dataset name',
          }),
        ]),
      );
    }

    const unresolved = [
      {
        column: "datasetName",
        type: "stringOptions",
        operator: "any of",
        value: ["Missing dataset"],
      },
    ] satisfies FilterState;
    expect(fromDatasetNameFilters(unresolved, datasets)).toEqual(unresolved);
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
    ).toBe('datasetName:"Billing: escalations"');
  });

  it("keeps experimentDatasetName as a backward-compatible alias", () => {
    const result = planCommit(
      'experimentDatasetName:"Support conversations"',
      undefined,
      EVALUATOR_FIELD_REGISTRY,
    );

    expect(result).toMatchObject({
      status: "committed",
      filters: [{ column: "datasetName" }],
    });
  });
});
