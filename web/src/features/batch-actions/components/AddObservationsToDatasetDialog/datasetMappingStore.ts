import { createStore } from "zustand/vanilla";
import type { DatasetInfo, FieldMappingConfig, MappingConfig } from "./types";
import { createDatasetMapping } from "./prepareDatasetMapping";

type DatasetMappingState = {
  datasetId: string | null;
  createdDataset: DatasetInfo | null;
  mapping: MappingConfig;
  screen: "compose" | "create";
  submission:
    | { status: "idle" }
    | { status: "pending" }
    | { status: "scheduled"; batchActionId: string; dataset: DatasetInfo };
  actions: {
    selectDataset: (dataset: DatasetInfo) => void;
    datasetCreated: (dataset: DatasetInfo) => void;
    setScreen: (screen: "compose" | "create") => void;
    changeMapping: (
      field: keyof MappingConfig,
      config: FieldMappingConfig,
    ) => void;
    startSubmission: () => boolean;
    scheduled: (batchActionId: string, dataset: DatasetInfo) => void;
    submissionFailed: () => void;
  };
};

export function createDatasetMappingStore() {
  return createStore<DatasetMappingState>((set, get) => ({
    datasetId: null,
    createdDataset: null,
    mapping: createDatasetMapping(null),
    screen: "compose",
    submission: { status: "idle" },
    actions: {
      selectDataset: (dataset) => {
        if (
          get().submission.status !== "idle" ||
          get().datasetId === dataset.id
        )
          return;
        set({ datasetId: dataset.id, mapping: createDatasetMapping(dataset) });
      },
      datasetCreated: (dataset) => {
        if (get().submission.status !== "idle") return;
        set({
          datasetId: dataset.id,
          createdDataset: dataset,
          mapping: createDatasetMapping(dataset),
          screen: "compose",
        });
      },
      setScreen: (screen) => {
        if (get().submission.status !== "idle") return;
        set({ screen });
      },
      changeMapping: (field, config) => {
        if (get().submission.status !== "idle") return;
        set((state) => ({ mapping: { ...state.mapping, [field]: config } }));
      },
      startSubmission: () => {
        if (get().submission.status !== "idle") return false;
        set({ submission: { status: "pending" } });
        return true;
      },
      scheduled: (batchActionId, dataset) => {
        if (get().submission.status !== "pending") return;
        set({ submission: { status: "scheduled", batchActionId, dataset } });
      },
      submissionFailed: () => {
        if (get().submission.status !== "pending") return;
        set({ submission: { status: "idle" } });
      },
    },
  }));
}

export type DatasetMappingStore = ReturnType<typeof createDatasetMappingStore>;
