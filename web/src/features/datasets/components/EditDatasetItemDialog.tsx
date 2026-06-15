import { api } from "@/src/utils/api";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Control, useForm, useWatch } from "react-hook-form";
import { useEffect, useState, useMemo } from "react";
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
import { useDatasetItemMediaUpload } from "../hooks/useDatasetItemMediaUpload";
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
  const [formError, setFormError] = useState<string | null>(null);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();

  const form = useForm<DatasetItemFormValues, unknown, DatasetItemFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      input: "",
      expectedOutput: "",
      metadata: "",
    },
  });

  useEffect(() => {
    if (datasetItem && open) {
      form.reset({
        input: stringifyDatasetItemData(datasetItem.input),
        expectedOutput: stringifyDatasetItemData(datasetItem.expectedOutput),
        metadata: stringifyDatasetItemData(datasetItem.metadata),
      });
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetItem?.id, open]);

  const { uploadFile, pendingUploads } = useDatasetItemMediaUpload({
    projectId,
  });

  const updateDatasetItemMutation = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => {
      utils.datasets.invalidate();
      onOpenChange(false);
    },
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (!!!datasetItem) return;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
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
              />
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

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
}: {
  control: Control<DatasetItemFormValues, unknown, DatasetItemFormValues>;
  dataset: DatasetSchema | null;
  disabled: boolean;
  isPending: boolean;
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
      disabled={disabled || (validation.hasSchemas && !validation.isValid)}
    >
      Save changes
    </Button>
  );
};
