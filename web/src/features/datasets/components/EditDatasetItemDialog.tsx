import { api } from "@/src/utils/api";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useId, useMemo, useState } from "react";
import { Form } from "@/src/components/ui/form";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
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
  toDatasetSchema,
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

type EditDatasetItemDialogFormProps = {
  projectId: string;
  datasetItem: DatasetItemDomain;
  dataset: ReturnType<typeof toDatasetSchema>;
  onSuccess: () => void;
};

const EditDatasetItemDialogForm = ({
  projectId,
  datasetItem,
  dataset,
  onSuccess,
}: EditDatasetItemDialogFormProps) => {
  const formId = useId();
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

  const [input, expectedOutput] = useWatch({
    control: form.control,
    name: ["input", "expectedOutput"],
  });
  const datasets = useMemo(() => (dataset ? [dataset] : []), [dataset]);
  const validation = useDatasetItemValidation(input, expectedOutput, datasets);

  const updateDatasetItemMutation = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => {
      utils.datasets.invalidate();
      onSuccess();
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

  const saveDisabled =
    !form.formState.isDirty ||
    !hasAccess ||
    (validation.hasSchemas && !validation.isValid) ||
    pendingUploads.length > 0;

  return (
    <Dialog
      size="xxl"
      title="Edit Dataset Item"
      actions={[
        {
          label: "Save changes",
          type: "submit",
          form: formId,
          loading: updateDatasetItemMutation.isPending,
          disabled: saveDisabled,
        },
      ]}
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Dialog.Body>
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
          </Dialog.Body>
        </form>
      </Form>
    </Dialog>
  );
};

export function EditDatasetItemDialog({
  projectId,
  datasetId,
  datasetItemId,
  onSuccess,
}: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  onSuccess: () => void;
}) {
  const datasetItem = api.datasets.itemById.useQuery({
    projectId,
    datasetId,
    datasetItemId,
  });
  const dataset = api.datasets.byId.useQuery({
    projectId,
    datasetId,
  });

  if (datasetItem.isPending || dataset.isPending) {
    return (
      <Dialog size="xxl" title="Edit Dataset Item">
        <Dialog.Body>
          <Skeleton className="h-[50vh] w-full" />
        </Dialog.Body>
      </Dialog>
    );
  }

  if (!datasetItem.data) {
    return (
      <Dialog
        size="xxl"
        title="Edit Dataset Item"
        text="Dataset item not found."
      />
    );
  }

  return (
    <EditDatasetItemDialogForm
      key={datasetItemId}
      projectId={projectId}
      datasetItem={datasetItem.data}
      dataset={toDatasetSchema(dataset.data ?? null)}
      onSuccess={onSuccess}
    />
  );
}
