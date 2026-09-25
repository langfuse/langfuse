import { useStore } from "zustand";
import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import {
  DatasetItemEditorLayout,
  DatasetItemPreviewField,
} from "@/src/features/datasets/components/DatasetItemEditorLayout";
import { MappingStep } from "./MappingStep";
import type { DatasetMappingStore } from "./datasetMappingStore";
import { prepareDatasetMapping } from "./prepareDatasetMapping";
import type { DatasetInfo, ObservationPreviewData } from "./types";

export function DatasetMappingEditor({
  store,
  datasets,
  observation,
  loading,
  unavailable,
  onRetry,
  count,
  onClose,
  onSubmit,
}: {
  store: DatasetMappingStore;
  datasets: DatasetInfo[];
  observation: ObservationPreviewData | null;
  loading: boolean;
  unavailable: boolean;
  onRetry: () => void;
  count: number;
  onClose: () => void;
  onSubmit: (dataset: DatasetInfo | null) => Promise<void>;
}) {
  const datasetId = useStore(store, (state) => state.datasetId);
  const createdDataset = useStore(store, (state) => state.createdDataset);
  const mapping = useStore(store, (state) => state.mapping);
  const pending = useStore(
    store,
    (state) => state.submission.status === "pending",
  );
  const actions = store.getState().actions;
  const options =
    createdDataset &&
    !datasets.some((dataset) => dataset.id === createdDataset.id)
      ? [...datasets, createdDataset]
      : datasets;
  const dataset = options.find((option) => option.id === datasetId) ?? null;
  const fields = prepareDatasetMapping(mapping, observation, dataset);
  const valid = fields.every((field) => field.errors.length === 0);
  return (
    <>
      <DialogBody className="min-h-0 overflow-hidden p-0">
        <DatasetItemEditorLayout
          selector={
            <div className="flex items-end gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-sm font-bold">Target dataset</span>
                <Combobox
                  name="Target dataset"
                  options={options.map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                  value={datasetId ?? undefined}
                  onValueChange={(id) => {
                    const selected = options.find((option) => option.id === id);
                    if (selected) actions.selectDataset(selected);
                  }}
                  placeholder="Select dataset"
                  searchPlaceholder="Search datasets..."
                  emptyText="No datasets found."
                  disabled={pending}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => actions.setScreen("create")}
                disabled={pending}
              >
                <Plus className="size-4" />
                Create dataset
              </Button>
            </div>
          }
          previewDescription={`Sample from the first selected observation. The same mappings apply to all ${count} observations.`}
          preview={
            loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <DatasetMappingPreview
                fields={fields}
                unavailable={unavailable}
                onRetry={onRetry}
              />
            )
          }
        >
          <fieldset
            disabled={pending}
            inert={pending}
            className="flex min-w-0 flex-col gap-6"
          >
            {fields.map((field) => (
              <MappingStep
                key={field.key}
                field={field}
                config={mapping[field.key]}
                onConfigChange={(config) =>
                  actions.changeMapping(field.key, config)
                }
                observationData={observation}
              />
            ))}
          </fieldset>
        </DatasetItemEditorLayout>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!dataset || !valid || loading || unavailable || count === 0}
          loading={pending}
          onClick={() => onSubmit(dataset)}
        >
          Add {count} observation{count === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </>
  );
}

function DatasetMappingPreview({
  fields,
  unavailable,
  onRetry,
}: {
  fields: ReturnType<typeof prepareDatasetMapping>;
  unavailable: boolean;
  onRetry: () => void;
}) {
  if (unavailable)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-muted-foreground text-sm">
          Preview could not be loaded.
        </p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  return (
    <>
      {fields.map((field) => (
        <DatasetItemPreviewField
          key={field.key}
          label={field.label}
          value={field.value}
          feedback={
            (field.errors.length > 0 || field.warnings.length > 0) && (
              <div className="flex flex-col gap-1 border-t px-3 py-2 text-xs">
                {field.errors.map((error, index) => (
                  <p key={index} className="text-destructive" role="alert">
                    {error}
                  </p>
                ))}
                {field.warnings.map((warning, index) => (
                  <p key={index} className="text-muted-foreground">
                    {warning}
                  </p>
                ))}
              </div>
            )
          }
        />
      ))}
    </>
  );
}
