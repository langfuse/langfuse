import type {
  BatchActionQuery,
  ObservationAddToDatasetConfig,
} from "@langfuse/shared";
import type { DatasetMappingStore } from "./datasetMappingStore";
import type { DatasetInfo, ObservationPreviewData } from "./types";
import { prepareDatasetMapping } from "./prepareDatasetMapping";

export async function submitDatasetBatch({
  projectId,
  store,
  dataset,
  observation,
  source,
  submit,
  onSuccess,
}: {
  projectId: string;
  store: DatasetMappingStore;
  dataset: DatasetInfo | null;
  observation: ObservationPreviewData | null;
  source: {
    query: BatchActionQuery;
    selectAll: boolean;
    selectedObservationIds: string[];
  };
  submit: (input: {
    projectId: string;
    query: BatchActionQuery;
    config: ObservationAddToDatasetConfig;
  }) => Promise<{ id: string }>;
  onSuccess: () => void;
}) {
  const { mapping, actions } = store.getState();
  if (
    !dataset ||
    !observation ||
    prepareDatasetMapping(mapping, observation, dataset).some(
      (field) => field.errors.length,
    )
  )
    return;
  if (!actions.startSubmission()) return;
  const query = source.selectAll
    ? source.query
    : {
        ...source.query,
        filter: [
          ...(source.query.filter ?? []),
          {
            column: "id",
            operator: "any of" as const,
            value: source.selectedObservationIds,
            type: "stringOptions" as const,
          },
        ],
      };
  try {
    const result = await submit({
      projectId,
      query,
      config: { datasetId: dataset.id, datasetName: dataset.name, mapping },
    });
    actions.scheduled(result.id, dataset);
  } catch {
    // tRPC owns error reporting; the mutation callback displays the failure.
    actions.submissionFailed();
    return;
  }
  onSuccess();
}
