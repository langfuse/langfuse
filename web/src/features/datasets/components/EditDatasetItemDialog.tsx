import { api } from "@/src/utils/api";
import * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import type { DatasetItemDomain } from "@langfuse/shared";
import { DatasetItemFields } from "./DatasetItemFields";
import {
  stringifyDatasetItemData,
  type DatasetSchema,
} from "../utils/datasetItemUtils";

const formSchema = z.object({
  input: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  expectedOutput: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  metadata: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
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

  const form = useForm({
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

  const inputValue = form.watch("input");
  const expectedOutputValue = form.watch("expectedOutput");

  // Create dataset array for validation hook
  const datasets = useMemo(() => {
    if (!dataset) return [];
    return [dataset];
  }, [dataset]);

  // Validate against dataset schemas
  const validation = useDatasetItemValidation(
    inputValue,
    expectedOutputValue,
    datasets,
  );

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
                <p className="mb-4 text-destructive">
                  <span className="font-bold">Error:</span> {formError}
                </p>
              ) : null}
              <DatasetItemFields
                inputValue={inputValue}
                expectedOutputValue={expectedOutputValue}
                metadataValue={form.watch("metadata")}
                dataset={dataset}
                editable={hasAccess}
                control={form.control}
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
              <Button
                type="submit"
                loading={updateDatasetItemMutation.isPending}
                disabled={
                  !form.formState.isDirty ||
                  !hasAccess ||
                  (validation.hasSchemas && !validation.isValid)
                }
              >
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
