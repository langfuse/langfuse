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
import { useTranslations } from "next-intl";

const formSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
  metadata: z.string(),
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
  const t = useTranslations("coreDetails.datasets.itemDialog");
  const tMisc = useTranslations("coreDetails.datasets.misc");
  const serializationError = {
    title: tMisc("stringifyFailed"),
    description: tMisc("stringifyFailedDescription"),
  };
  const [formError, setFormError] = useState<string | null>(null);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();

  const form = useForm<DatasetItemFormValues, unknown, DatasetItemFormValues>({
    resolver: zodResolver(
      formSchema.superRefine((values, context) => {
        const message = t("invalidInput");
        (["input", "expectedOutput", "metadata"] as const).forEach((field) => {
          if (!isValidDatasetJson(values[field])) {
            context.addIssue({ code: "custom", path: [field], message });
          }
        });
      }),
    ),
    defaultValues: {
      input: "",
      expectedOutput: "",
      metadata: "",
    },
  });

  const { uploadFile, pendingUploads, resetPendingUploads } =
    useDatasetItemMediaUpload({
      projectId,
      datasetId: datasetItem?.datasetId ?? "",
      datasetItemId: datasetItem?.id ?? "",
    });

  useEffect(() => {
    if (datasetItem && open) {
      form.reset({
        input: stringifyDatasetItemData(datasetItem.input, serializationError),
        expectedOutput: stringifyDatasetItemData(
          datasetItem.expectedOutput,
          serializationError,
        ),
        metadata: stringifyDatasetItemData(
          datasetItem.metadata,
          serializationError,
        ),
      });
      setFormError(null);
      // The hook lives above DialogContent (which unmounts on close), so its
      // pending uploads would otherwise leak onto the next item's edit dialog.
      resetPendingUploads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetItem?.id, open]);

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
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex h-full flex-col"
          >
            <DialogBody>
              {formError ? (
                <p className="text-destructive mb-4">
                  <span className="font-bold">{t("error")}</span> {formError}
                </p>
              ) : null}
              <DatasetItemFields
                dataset={dataset}
                editable={hasAccess}
                projectId={projectId}
                control={form.control}
                onUploadMedia={
                  hasAccess && datasetItem ? uploadFile : undefined
                }
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
                {t("cancel")}
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
  pendingUploads,
}: {
  control: Control<DatasetItemFormValues, unknown, DatasetItemFormValues>;
  dataset: DatasetSchema | null;
  disabled: boolean;
  isPending: boolean;
  pendingUploads: PendingMediaUpload[];
}) => {
  const t = useTranslations("coreDetails.datasets.itemDialog");
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
      {t("saveChanges")}
    </Button>
  );
};
