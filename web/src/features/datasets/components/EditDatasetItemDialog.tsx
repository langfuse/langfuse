import { api } from "@/src/utils/api";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Control, useForm, useFormState, useWatch } from "react-hook-form";
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Form } from "@/src/components/ui/form";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useEditDatasetItemDialogData } from "../hooks/useEditDatasetItemDialogData";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import {
  useDatasetItemMediaUpload,
  type PendingMediaUpload,
} from "../hooks/useDatasetItemMediaUpload";
import type {
  DatasetItemDomain,
  DatasetItemMediaField,
} from "@langfuse/shared";
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

type DialogSaveAction = {
  label: string;
  type: "submit";
  form: string;
  loading?: boolean;
  disabled?: boolean;
};

const EditDatasetItemFieldsSection = memo(
  function EditDatasetItemFieldsSection({
    dataset,
    editable,
    projectId,
    control,
    onUploadMedia,
    pendingUploads,
  }: {
    dataset: DatasetSchema | null;
    editable: boolean;
    projectId: string;
    control: Control<DatasetItemFormValues, unknown, DatasetItemFormValues>;
    onUploadMedia:
      | ((file: File, field: DatasetItemMediaField) => Promise<string | null>)
      | undefined;
    pendingUploads: PendingMediaUpload[];
  }) {
    return (
      <DatasetItemFields
        dataset={dataset}
        editable={editable}
        projectId={projectId}
        control={control}
        onUploadMedia={onUploadMedia}
        pendingUploads={pendingUploads}
      />
    );
  },
);

function useEditDatasetItemDialogSaveAction({
  control,
  dataset,
  pendingUploads,
  hasAccess,
  isSubmitting,
  formId,
}: {
  control: Control<DatasetItemFormValues, unknown, DatasetItemFormValues>;
  dataset: DatasetSchema | null;
  pendingUploads: PendingMediaUpload[];
  hasAccess: boolean;
  isSubmitting: boolean;
  formId: string;
}): DialogSaveAction {
  const { isDirty } = useFormState({ control });
  const [input, expectedOutput] = useWatch({
    control,
    name: ["input", "expectedOutput"],
  });
  const datasets = useMemo(() => (dataset ? [dataset] : []), [dataset]);
  const validation = useDatasetItemValidation(input, expectedOutput, datasets);

  const saveDisabled =
    !isDirty ||
    !hasAccess ||
    (validation.hasSchemas && !validation.isValid) ||
    pendingUploads.length > 0;

  return useMemo(
    () => ({
      label: "Save changes",
      type: "submit" as const,
      form: formId,
      loading: isSubmitting,
      disabled: saveDisabled,
    }),
    [formId, isSubmitting, saveDisabled],
  );
}

function EditDatasetItemDialogFormBody({
  formId,
  projectId,
  datasetItem,
  dataset,
  onSuccess,
  setSaveAction,
}: {
  formId: string;
  projectId: string;
  datasetItem: DatasetItemDomain;
  dataset: DatasetSchema | null;
  onSuccess: () => void;
  setSaveAction: Dispatch<SetStateAction<DialogSaveAction>>;
}) {
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

  const saveAction = useEditDatasetItemDialogSaveAction({
    control: form.control,
    dataset,
    pendingUploads,
    hasAccess,
    isSubmitting: updateDatasetItemMutation.isPending,
    formId,
  });

  useEffect(() => {
    setSaveAction(saveAction);
  }, [saveAction, setSaveAction]);

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        {formError ? (
          <p className="text-destructive mb-4">
            <span className="font-bold">Error:</span> {formError}
          </p>
        ) : null}
        <EditDatasetItemFieldsSection
          dataset={dataset}
          editable={hasAccess}
          projectId={projectId}
          control={form.control}
          onUploadMedia={hasAccess ? uploadFile : undefined}
          pendingUploads={pendingUploads}
        />
      </form>
    </Form>
  );
}

export function EditDatasetItemDialog({
  isOpen,
  projectId,
  datasetId,
  datasetItemId,
  onSuccess,
}: {
  isOpen: boolean;
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  onSuccess: () => void;
}) {
  const formId = useId();
  const [saveAction, setSaveAction] = useState<DialogSaveAction>({
    label: "Save changes",
    type: "submit",
    form: formId,
    disabled: true,
  });

  const { datasetItem, dataset, isLoading, isNotFound } =
    useEditDatasetItemDialogData({
      projectId,
      datasetId,
      datasetItemId,
      enabled: isOpen,
    });

  const showForm = datasetItem != null;

  function renderBody() {
    if (!isOpen) {
      return <Dialog.Body>{null}</Dialog.Body>;
    }
    if (isLoading) {
      return (
        <Dialog.Body>
          <Skeleton className="h-[50vh] w-full" />
        </Dialog.Body>
      );
    }
    if (isNotFound) {
      return (
        <Dialog.Body>
          <p>Dataset item not found.</p>
        </Dialog.Body>
      );
    }
    if (showForm) {
      return (
        <Dialog.Body>
          <EditDatasetItemDialogFormBody
            key={datasetItem.id}
            formId={formId}
            projectId={projectId}
            datasetItem={datasetItem}
            dataset={dataset}
            onSuccess={onSuccess}
            setSaveAction={setSaveAction}
          />
        </Dialog.Body>
      );
    }
    return <Dialog.Body>{null}</Dialog.Body>;
  }

  return (
    <Dialog
      size="xxl"
      title="Edit Dataset Item"
      actions={isOpen && showForm ? [saveAction] : undefined}
    >
      {renderBody()}
    </Dialog>
  );
}
