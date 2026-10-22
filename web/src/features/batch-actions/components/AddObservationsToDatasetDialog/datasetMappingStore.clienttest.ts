import { describe, expect, it, vi } from "vitest";
import { createDatasetMappingStore } from "./datasetMappingStore";
import {
  createDatasetMapping,
  prepareDatasetMapping,
} from "./prepareDatasetMapping";
import { submitDatasetBatch } from "./submitDatasetBatch";

const dataset = {
  id: "dataset",
  name: "Review examples",
  inputSchema: null,
  expectedOutputSchema: null,
};
const observation = {
  id: "observation",
  input: { question: "Example" },
  output: "Answer",
  metadata: { region: "west" },
};

describe("Dataset mapping ownership", () => {
  it("initializes schema mappings on selection and preserves edits through returning from create or reselecting the same dataset", () => {
    const store = createDatasetMappingStore();
    const withSchema = {
      ...dataset,
      inputSchema: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"],
      },
    };
    const actions = store.getState().actions;
    actions.selectDataset(withSchema);
    expect(store.getState().mapping.input.mode).toBe("custom");
    actions.changeMapping("input", { mode: "full" });
    actions.setScreen("create");
    actions.setScreen("compose");
    actions.selectDataset({ ...withSchema });
    expect(store.getState().mapping.input).toEqual({ mode: "full" });
    expect(
      prepareDatasetMapping(
        store.getState().mapping,
        observation,
        withSchema,
      )[0].errors,
    ).toEqual([]);
  });

  it.each(["selectDataset", "datasetCreated"] as const)(
    "keeps edited mappings when %s supplies schema defaults",
    (action) => {
      const store = createDatasetMappingStore();
      const actions = store.getState().actions;
      actions.changeMapping("input", { mode: "full" });
      actions.changeMapping("metadata", { mode: "full" });
      const schema = {
        type: "object",
        properties: { answer: { type: "string" } },
      };
      actions[action]({
        ...dataset,
        inputSchema: schema,
        expectedOutputSchema: schema,
      });
      expect(store.getState().mapping.input).toEqual({ mode: "full" });
      expect(store.getState().mapping.metadata).toEqual({ mode: "full" });
      expect(store.getState().mapping.expectedOutput.mode).toBe("custom");
      expect(store.getState().datasetId).toBe(dataset.id);
    },
  );

  it("validates JSONPath syntax for every field without a schema and retains preview misses as warnings", () => {
    const mapping = createDatasetMapping(null);
    mapping.metadata = {
      mode: "custom",
      custom: {
        type: "root",
        rootConfig: { sourceField: "metadata", jsonPath: "$[?(@.region ===)]" },
      },
    };
    const invalid = prepareDatasetMapping(mapping, observation, dataset);
    expect(
      invalid.find((field) => field.key === "metadata")?.errors.length,
    ).toBeGreaterThan(0);
    mapping.metadata.custom!.rootConfig!.jsonPath = "$.missing";
    const missing = prepareDatasetMapping(mapping, observation, dataset).find(
      (field) => field.key === "metadata",
    )!;
    expect(missing.errors).toEqual([]);
    expect(missing.warnings).toHaveLength(1);
  });

  it("submits the selected source once, preserves its mapping, and reports completion only after acceptance", async () => {
    const store = createDatasetMappingStore();
    store.getState().actions.selectDataset(dataset);
    store.getState().actions.changeMapping("metadata", { mode: "full" });
    let resolveSubmission!: (value: { id: string }) => void;
    const submit = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    const onSuccess = vi.fn();
    const parameters = {
      projectId: "project",
      store,
      dataset,
      observation,
      source: {
        query: { filter: [], orderBy: null },
        selectAll: false,
        selectedObservationIds: ["observation"],
      },
      submit,
      onSuccess,
    };
    const pending = submitDatasetBatch(parameters);
    await submitDatasetBatch(parameters);
    const assertSubmissionKeepsDraft = () => {
      const submittedState = store.getState();
      const actions = submittedState.actions;
      actions.changeMapping("metadata", { mode: "none" });
      actions.selectDataset({ ...dataset, id: "other" });
      actions.datasetCreated({ ...dataset, id: "created" });
      actions.setScreen("create");
      expect(store.getState()).toBe(submittedState);
    };
    assertSubmissionKeepsDraft();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          filter: [
            {
              column: "id",
              type: "stringOptions",
              operator: "any of",
              value: ["observation"],
            },
          ],
          orderBy: null,
        },
        config: expect.objectContaining({
          mapping: expect.objectContaining({ metadata: { mode: "full" } }),
        }),
      }),
    );
    resolveSubmission({ id: "batch" });
    await pending;
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(store.getState().submission).toEqual({
      status: "scheduled",
      batchActionId: "batch",
      dataset,
    });
    assertSubmissionKeepsDraft();
    store.getState().actions.submissionFailed();
    expect(store.getState().submission.status).toBe("scheduled");
  });
});
