import type { FilterState } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  EVALUATOR_FIELD_REGISTRY,
  RULE_SAMPLE_FIELD_REGISTRY,
} from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import {
  type FieldRegistry,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { addDatasetNameObservedOptions } from "./datasetNameFilter";

const datasets = [
  { id: "dataset-id-1", name: "Support conversations" },
  { id: "dataset-id-2", name: "Billing: escalations" },
];
const withDatasets = (registry: FieldRegistry) =>
  withFieldOptions(
    registry,
    "datasetName",
    datasets.map((dataset) => ({
      value: dataset.id,
      displayValue: dataset.name,
    })),
  );

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

    const query = filterStateToQueryText(
      persisted,
      {},
      withDatasets(EVALUATOR_FIELD_REGISTRY),
    );
    expect(query.text).toBe(
      'datasetName:("Support conversations" OR "Billing: escalations")',
    );
    const result = planCommit(
      query.text,
      undefined,
      withDatasets(EVALUATOR_FIELD_REGISTRY),
    );
    expect(result).toMatchObject({ status: "committed", filters: persisted });
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

    const registry = withDatasets(EVALUATOR_FIELD_REGISTRY);
    const query = filterStateToQueryText(persisted, {}, registry);
    expect(query.text).toBe("-experimentDatasetId:deleted-dataset-id");
    expect(planCommit(query.text, undefined, registry)).toMatchObject({
      status: "committed",
      filters: persisted,
    });
  });

  it("round-trips dataset presence filters through the name column", () => {
    const persisted = [
      {
        column: "experimentDatasetId",
        type: "null",
        operator: "is not null",
        value: "",
      },
    ] satisfies FilterState;

    const registry = withDatasets(EVALUATOR_FIELD_REGISTRY);
    expect(filterStateToQueryText(persisted, {}, registry).text).toBe(
      "has:datasetName",
    );
    const result = planCommit("has:datasetName", undefined, registry);
    expect(result).toMatchObject({ status: "committed", filters: persisted });
  });

  it("accepts dataset names in evaluator and rule search queries", () => {
    for (const registry of [
      EVALUATOR_FIELD_REGISTRY,
      RULE_SAMPLE_FIELD_REGISTRY,
    ]) {
      const registryWithDatasets = withDatasets(registry);
      const result = planCommit(
        'datasetName:"Support conversations"',
        undefined,
        registryWithDatasets,
      );

      expect(result.status).toBe("committed");
      if (result.status !== "committed") continue;

      expect(result.filters).toEqual([
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
    const registry = withDatasets(EVALUATOR_FIELD_REGISTRY);
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
  });

  it("rejects partial-match operators for dataset names", () => {
    const registry = withFieldOptions(EVALUATOR_FIELD_REGISTRY, "datasetName", [
      { value: "dataset-id", displayValue: "Support" },
    ]);

    expect(
      planCommit("datasetName:*Support*", undefined, registry).status,
    ).toBe("invalid");
  });

  it("quotes dataset names containing grammar characters", () => {
    expect(
      filterStateToQueryText(
        [
          {
            column: "experimentDatasetId",
            type: "stringOptions",
            operator: "any of",
            value: ["dataset-id-2"],
          },
        ],
        {},
        withDatasets(EVALUATOR_FIELD_REGISTRY),
      ).text,
    ).toBe('datasetName:"Billing: escalations"');
  });

  it("keeps experimentDatasetName as a backward-compatible alias", () => {
    const result = planCommit(
      'experimentDatasetName:"Support conversations"',
      undefined,
      withDatasets(EVALUATOR_FIELD_REGISTRY),
    );

    expect(result).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "experimentDatasetId",
          value: ["dataset-id-1"],
        },
      ],
    });
  });
});
