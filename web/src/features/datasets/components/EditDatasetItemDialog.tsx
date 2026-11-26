/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { api } from "@/src/utils/api";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Control, useForm, useWatch } from "react-hook-form";
import { useMemo, useState } from "react";
import { Form } from "@/src/components/ui/form";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import {
  useDatasetItemMediaUpload,
  type PendingMediaUpload,
} from "../hooks/useDatasetItemMediaUpload";
import type { DatasetItemDomain } from "@langfuse/shared";
import {
  DatasetItemFields,
  type DatasetItemFormValues,
} from "./DatasetItemFields";
import {
  stringifyDatasetItemData,
  type DatasetSchema,
} from "../utils/datasetItemUtils";
import { isValidDatasetJson } from "../utils/parseDatasetJson";

const formSchema = z.object({
  input: z.string().refine(
    (value) => {
      return isValidDatasetJson(value);
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  expectedOutput: z.string().refine(
    (value) => {
      return isValidDatasetJson(value);
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  metadata: z.string().refine(
    (value) => {
      return isValidDatasetJson(value);
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
});

function datasetItemToDefaultValues(
  datasetItem: DatasetItemDomain,
): DatasetItemFormValues {
  return {
    input: stringifyDatasetItemData(datasetItem.input),
    expectedOutput: stringifyDatasetItemData(datasetItem.expectedOutput),
    metadata: stringifyDatasetItemData(datasetItem.metadata),
  };
}

/**
 * Submit button isolated from the dialog so schema validation (which depends on
 * the live field values) re-renders only the button as the user types, not the
 * editors. Subscribes to the values via `useWatch` rather than `form.watch` at
 * the dialog level.
 */
const SaveChangesButton = ({
  control,
  dataset,
  disabled,
  isPending,
  pendingUploads,
}: {
  control: Control<DatasetItemFormValues, unknown, DatasetItemFormValues>;
  dataset: DatasetSchema | null;
  disabled: boolean;
  isPending: boolean;
  pendingUploads: PendingMediaUpload[];
}) => {
  const [input, expectedOutput] = useWatch({
    control,
    name: ["input", "expectedOutput"],
  });

  const datasets = useMemo(() => (dataset ? [dataset] : []), [dataset]);
  const validation = useDatasetItemValidation(input, expectedOutput, datasets);

  return (
    <Button
      type="submit"
      loading={isPending}
      // Block submit while uploads are in flight: the media reference is only
      // inserted into the form value after the upload resolves, so submitting
      // early would persist the item without the attachment and orphan the
      // uploaded bytes on S3.
      disabled={
        disabled ||
        (validation.hasSchemas && !validation.isValid) ||
        pendingUploads.length > 0
      }
    >
      Save changes
    </Button>
  );
};

const EditDatasetItemDialogForm = ({
  projectId,
  datasetItem,
  dataset,
  onOpenChange,
}: {
  projectId: string;
  datasetItem: DatasetItemDomain;
  dataset: DatasetSchema | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();

  const form = useForm<DatasetItemFormValues, unknown, DatasetItemFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: datasetItemToDefaultValues(datasetItem),
  });

  const { uploadFile, pendingUploads } = useDatasetItemMediaUpload({
    projectId,
    datasetId: datasetItem.datasetId,
    datasetItemId: datasetItem.id,
  });

  const updateDatasetItemMutation = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => {
      utils.datasets.invalidate();
      onOpenChange(false);
    },
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateDatasetItemMutation.mutate({
      projectId: projectId,
      datasetId: datasetItem.datasetId,
      datasetItemId: datasetItem.id,
      input: values.input,
      expectedOutput: values.expectedOutput,
      metadata: values.metadata,
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Dataset Item</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex h-full flex-col"
        >
          <DialogBody>
            {formError ? (
              <p className="text-destructive mb-4">
                <span className="font-bold">Error:</span> {formError}
              </p>
            ) : null}
            <DatasetItemFields
              dataset={dataset}
              editable={hasAccess}
              projectId={projectId}
              control={form.control}
              onUploadMedia={hasAccess ? uploadFile : undefined}
              pendingUploads={pendingUploads}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateDatasetItemMutation.isPending}
            >
              Cancel
            </Button>
            <SaveChangesButton
              control={form.control}
              dataset={dataset}
              disabled={!form.formState.isDirty || !hasAccess}
              isPending={updateDatasetItemMutation.isPending}
              pendingUploads={pendingUploads}
            />
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};

type EditDatasetItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  datasetItem: DatasetItemDomain | null;
  dataset: DatasetSchema | null;
};

export const EditDatasetItemDialog = ({
  open,
  onOpenChange,
  projectId,
  datasetItem,
  dataset,
}: EditDatasetItemDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        {datasetItem ? (
          <EditDatasetItemDialogForm
            key={datasetItem.id}
            projectId={projectId}
            datasetItem={datasetItem}
            dataset={dataset}
            onOpenChange={onOpenChange}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Edit Dataset Item</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
};
