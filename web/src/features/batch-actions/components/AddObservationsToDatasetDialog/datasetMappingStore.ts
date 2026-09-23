import { createStore } from "zustand/vanilla";
import type { DatasetInfo, FieldMappingConfig, MappingConfig } from "./types";
import { createDatasetMapping } from "./prepareDatasetMapping";

type DatasetMappingState = {
  datasetId: string | null;
  createdDataset: DatasetInfo | null;
  mapping: MappingConfig;
  editedFields: Set<keyof MappingConfig>;
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

function mappingForDataset(dataset: DatasetInfo, state: DatasetMappingState) {
  const mapping = createDatasetMapping(dataset);
  for (const field of state.editedFields) mapping[field] = state.mapping[field];
  return mapping;
}

export function createDatasetMappingStore() {
  return createStore<DatasetMappingState>((set, get) => ({
    datasetId: null,
    createdDataset: null,
    mapping: createDatasetMapping(null),
    editedFields: new Set(),
    screen: "compose",
    submission: { status: "idle" },
    actions: {
      selectDataset: (dataset) => {
        if (
          get().submission.status !== "idle" ||
          get().datasetId === dataset.id
        )
          return;
        set({
          datasetId: dataset.id,
          mapping: mappingForDataset(dataset, get()),
        });
      },
      datasetCreated: (dataset) => {
        if (get().submission.status !== "idle") return;
        set({
          datasetId: dataset.id,
          createdDataset: dataset,
          mapping: mappingForDataset(dataset, get()),
          screen: "compose",
        });
      },
      setScreen: (screen) => {
        if (get().submission.status !== "idle") return;
        set({ screen });
      },
      changeMapping: (field, config) => {
        if (get().submission.status !== "idle") return;
        set((state) => ({
          mapping: { ...state.mapping, [field]: config },
          editedFields: new Set([...state.editedFields, field]),
        }));
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
