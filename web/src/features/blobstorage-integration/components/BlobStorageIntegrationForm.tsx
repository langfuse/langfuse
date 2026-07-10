import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import {
  isLegacyBlobExportAllowed,
  isLegacyBlobExporter,
  type BlobStorageIntegration,
} from "@langfuse/shared";
import {
  blobStorageIntegrationFormSchema,
  parquetEnabledFromTuning,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { isExportSourceSelectable } from "@/src/features/blobstorage-integration/exportSource";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { buildBlobStorageFormValues } from "@/src/features/blobstorage-integration/components/formValues";
import { StorageProviderFields } from "@/src/features/blobstorage-integration/components/StorageProviderFields";
import { ExportScheduleFields } from "@/src/features/blobstorage-integration/components/ExportScheduleFields";
import { ExportSourceField } from "@/src/features/blobstorage-integration/components/ExportSourceField";
import { ExportFieldGroupsField } from "@/src/features/blobstorage-integration/components/ExportFieldGroupsField";
import { GzipCompressionField } from "@/src/features/blobstorage-integration/components/GzipCompressionField";

export const BlobStorageIntegrationForm = ({
  state,
  projectId,
  isLoading,
  isEnrichedExportAvailable,
}: {
  state?: Partial<BlobStorageIntegration>;
  projectId: string;
  isLoading: boolean;
  isEnrichedExportAvailable: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { project } = useQueryProject();

  const isPostCutoffCloud =
    project?.createdAt != null &&
    !isLegacyBlobExportAllowed(new Date(project.createdAt), isLangfuseCloud);
  const eventsExportAvailable = isEnrichedExportAvailable;
  // Integration-level cutoff (Cloud only): a row predating the exporter cutoff
  // keeps legacy options; a new or post-cutoff row is locked to EVENTS.
  const isLegacyExporter = isLegacyBlobExporter(
    state?.createdAt ? new Date(state.createdAt) : null,
    isLangfuseCloud,
  );
  const forceEventsExport =
    isPostCutoffCloud || (eventsExportAvailable && !isLegacyExporter);
  const availability = useMemo(
    () => ({ eventsExportAvailable, forceEventsExport }),
    [eventsExportAvailable, forceEventsExport],
  );

  // Block the save when the persisted source is no longer selectable rather
  // than silently rewriting it (LFE-10296).
  const formSchema = useMemo(
    () =>
      blobStorageIntegrationFormSchema.superRefine((data, ctx) => {
        if (!isExportSourceSelectable(data.exportSource, availability)) {
          ctx.addIssue({
            code: "custom",
            path: ["exportSource"],
            message:
              "This export source is not available on this deployment. Select an available export source to save.",
          });
        }
      }),
    [availability],
  );

  // Reactive `values` re-syncs the form whenever the persisted integration or
  // the deployment availability changes, keeping unsaved edits — no manual
  // reset effect needed.
  const formValues = useMemo(
    () => buildBlobStorageFormValues(state, availability),
    [state, availability],
  );
  const blobStorageForm = useForm({
    resolver: zodResolver(formSchema),
    values: formValues,
    resetOptions: { keepDirtyValues: true },
    disabled: isLoading,
  });

  // Internal `exportTuning.parquet` override (no write path); reflected
  // read-only since the worker forces Parquet over the persisted fileType
  // + gzip.
  const isParquetOverride = parquetEnabledFromTuning(state?.exportTuning);

  const utils = api.useUtils();
  const mut = api.blobStorageIntegration.update.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
    },
    onError: (error) => {
      showErrorToast("Failed to save integration", error.message);
    },
  });
  const mutDelete = api.blobStorageIntegration.delete.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
    },
  });
  const mutRunNow = api.blobStorageIntegration.runNow.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
    },
  });
  const mutValidate = api.blobStorageIntegration.validate.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: data.message,
        description: `Test file: ${data.testFileName}`,
      });
    },
    onError: (error) => {
      showErrorToast("Validation failed", error.message);
    },
  });

  async function onSubmit(values: BlobStorageIntegrationFormSchema) {
    capture("integrations:blob_storage_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  }

  const control = blobStorageForm.control;

  return (
    <Form {...blobStorageForm}>
      <form
        className="space-y-3"
        onSubmit={blobStorageForm.handleSubmit(onSubmit)}
      >
        <StorageProviderFields control={control} />
        <ExportScheduleFields
          control={control}
          isParquetOverride={isParquetOverride}
        />
        <ExportSourceField
          control={control}
          persistedExportSource={state?.exportSource}
          availability={availability}
        />
        <ExportFieldGroupsField
          control={control}
          isParquetOverride={isParquetOverride}
        />
        <GzipCompressionField
          control={control}
          isParquetOverride={isParquetOverride}
        />
        <FormField
          control={control}
          name="enabled"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enabled</FormLabel>
              <FormControl>
                <div className="mt-1 ml-4">
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
      <div className="mt-8 flex gap-2">
        <Button
          loading={mut.isPending}
          onClick={blobStorageForm.handleSubmit(onSubmit)}
          disabled={isLoading}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          loading={mutValidate.isPending}
          disabled={isLoading || !state}
          title="Test your saved configuration by uploading a small test file to your storage"
          onClick={() => {
            mutValidate.mutate({ projectId });
          }}
        >
          Validate
        </Button>
        <Button
          variant="secondary"
          loading={mutRunNow.isPending}
          disabled={isLoading || !state?.enabled}
          title="Trigger an immediate export of all data since the last sync"
          onClick={() => {
            if (
              confirm(
                "Are you sure you want to run the blob storage export now? This will export all data since the last sync.",
              )
            )
              mutRunNow.mutate({ projectId });
          }}
        >
          Run Now
        </Button>
        <Button
          variant="ghost"
          loading={mutDelete.isPending}
          disabled={isLoading || !state}
          onClick={() => {
            if (
              confirm(
                "Are you sure you want to reset the Blob Storage integration for this project?",
              )
            )
              mutDelete.mutate({ projectId });
          }}
        >
          Reset
        </Button>
      </div>
    </Form>
  );
};
