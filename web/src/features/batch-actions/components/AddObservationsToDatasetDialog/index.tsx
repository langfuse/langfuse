import { useRef, useState } from "react";
import { useStore } from "zustand";
import { parseJsonPrioritised, type BatchActionQuery } from "@langfuse/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/src/components/ui/dialog";
import { api, sendAsPostOption } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications";
import { DatasetCreateStep } from "./DatasetCreateStep";
import { DatasetMappingEditor } from "./DatasetMappingEditor";
import { StatusStep } from "./StatusStep";
import { createDatasetMappingStore } from "./datasetMappingStore";
import { submitDatasetBatch } from "./submitDatasetBatch";
import type { ObservationPreviewData } from "./types";

type AddObservationsToDatasetDialogProps = {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  isV4: boolean;
  exampleObservation: { id: string; traceId: string; startTime?: Date };
};

function normalizeValue(value: unknown) {
  if (typeof value !== "string") return value;
  const parsed = parseJsonPrioritised(value);
  return parsed === undefined ? value : parsed;
}

export function AddObservationsToDatasetDialog(
  props: AddObservationsToDatasetDialogProps,
) {
  const [source] = useState(() => ({
    selectedObservationIds: [...props.selectedObservationIds],
    query: props.query,
    selectAll: props.selectAll,
    totalCount: props.totalCount,
    exampleObservation: props.exampleObservation,
    isV4: props.isV4,
  }));
  const [store] = useState(createDatasetMappingStore);
  const screen = useStore(store, (state) => state.screen);
  const submission = useStore(store, (state) => state.submission);
  const createPending = useRef(false);
  const count = source.selectAll
    ? source.totalCount
    : source.selectedObservationIds.length;
  const example = source.exampleObservation;
  const datasets = api.datasets.allDatasetMeta.useQuery({
    projectId: props.projectId,
  });
  const observationQuery = api.observations.byId.useQuery(
    {
      projectId: props.projectId,
      observationId: example.id,
      traceId: example.traceId,
      startTime: example.startTime,
    },
    { enabled: !source.isV4 && Boolean(example.id && example.traceId) },
  );
  const eventQuery = api.events.batchIO.useQuery(
    {
      projectId: props.projectId,
      observations: [{ id: example.id, traceId: example.traceId }],
      minStartTime: example.startTime as Date,
      maxStartTime: example.startTime as Date,
      truncated: false,
    },
    {
      ...sendAsPostOption,
      enabled:
        source.isV4 &&
        Boolean(example.id && example.traceId && example.startTime),
    },
  );
  const raw = source.isV4 ? eventQuery.data?.[0] : observationQuery.data;
  const observation: ObservationPreviewData | null = raw
    ? {
        id: example.id,
        input: normalizeValue(raw.input),
        output: normalizeValue(raw.output),
        metadata: normalizeValue(raw.metadata),
      }
    : null;
  const previewQuery = source.isV4 ? eventQuery : observationQuery;
  const mutation = api.batchAction.addToDataset.create.useMutation({
    onError: (error) =>
      showErrorToast("Failed to schedule action", error.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (
          !open &&
          store.getState().submission.status !== "pending" &&
          !createPending.current
        )
          props.onClose();
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {screen === "create"
              ? "Create dataset"
              : `Add ${count} observation${count === 1 ? "" : "s"} to dataset`}
          </DialogTitle>
          <DialogDescription>
            {screen === "create"
              ? "Create a dataset, then review the values to add."
              : "Choose a dataset and review how each observation becomes a dataset item."}
          </DialogDescription>
        </DialogHeader>
        {submission.status === "scheduled" && (
          <DialogBody>
            <StatusStep
              projectId={props.projectId}
              batchActionId={submission.batchActionId}
              dataset={submission.dataset}
              expectedCount={count}
              onClose={props.onClose}
            />
          </DialogBody>
        )}
        {submission.status !== "scheduled" && screen === "create" && (
          <DatasetCreateStep
            projectId={props.projectId}
            onDatasetCreated={(dataset) => {
              store.getState().actions.datasetCreated(dataset);
            }}
            onSubmittingChange={(pending) => {
              createPending.current = pending;
            }}
            onCancel={() => store.getState().actions.setScreen("compose")}
          />
        )}
        {submission.status !== "scheduled" && screen === "compose" && (
          <DatasetMappingEditor
            store={store}
            datasets={datasets.data ?? []}
            loading={datasets.isLoading || previewQuery.isLoading}
            unavailable={
              datasets.isError ||
              previewQuery.isError ||
              (!previewQuery.isLoading && !observation)
            }
            onRetry={() => {
              datasets.refetch();
              previewQuery.refetch();
            }}
            observation={observation}
            count={count}
            onClose={props.onClose}
            onSubmit={(dataset) =>
              submitDatasetBatch({
                projectId: props.projectId,
                store,
                dataset,
                observation,
                source,
                submit: mutation.mutateAsync,
                onSuccess: props.onSuccess,
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
