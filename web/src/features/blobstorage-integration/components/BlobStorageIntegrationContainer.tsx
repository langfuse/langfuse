import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import {
  type BlobStorageIntegration,
  type ExportSourceContext,
} from "@langfuse/shared";
import { type BlobStorageIntegrationFormSchema } from "@/src/features/blobstorage-integration/types";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { buildBlobStorageFormValues } from "@/src/features/blobstorage-integration/components/formValues";
import { BlobStorageIntegrationForm } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationForm";

// State layer. Owns everything async and entity-scoped: availability
// derivation, the four mutations, and the entity-action buttons. The form
// below it is a disposable draft: it is not mounted until every input has
// resolved, and it is remounted (via key) whenever the entity identity
// changes — project switch, create, delete. Background refetches of the
// same entity (status poll, post-save invalidation) keep the key stable so
// they can never touch a draft in progress.
export const BlobStorageIntegrationContainer = ({
  config,
  projectId,
  isLoading,
  isEnrichedExportAvailable,
  legacyWritesActive,
}: {
  config: Partial<BlobStorageIntegration> | null;
  projectId: string;
  isLoading: boolean;
  isEnrichedExportAvailable: boolean;
  legacyWritesActive: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { project } = useQueryProject();

  // Policy context for the export-source selector; the policy itself lives in
  // export-source-policy.ts. null integrationCreatedAt = new row.
  const projectCreatedAt = project?.createdAt;
  const integrationCreatedAt = config?.createdAt;
  const exportSourceCtx: ExportSourceContext = useMemo(
    () => ({
      isCloud: isLangfuseCloud,
      enrichedAvailable: isEnrichedExportAvailable,
      legacyWritesActive,
      projectCreatedAt: projectCreatedAt
        ? new Date(projectCreatedAt)
        : undefined,
      integrationCreatedAt: integrationCreatedAt
        ? new Date(integrationCreatedAt)
        : null,
    }),
    [
      isLangfuseCloud,
      isEnrichedExportAvailable,
      legacyWritesActive,
      projectCreatedAt,
      integrationCreatedAt,
    ],
  );

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

  // The form is never mounted before its inputs resolve, so there is no
  // mid-flight reset to protect a draft from.
  if (isLoading || !project) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const handleSubmit = (values: BlobStorageIntegrationFormSchema) => {
    capture("integrations:blob_storage_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  };

  return (
    <BlobStorageIntegrationForm
      // Draft lifetime = entity identity. Deliberately NOT updatedAt:
      // exists→exists refetches (5s status poll, post-update refetch) must
      // not remount, so mid-save typing survives. Delete flips
      // configured→new and remounts blank; create flips new→configured and
      // remounts from the saved row (clearing stale dirty flags).
      key={`${projectId}:${config ? "configured" : "new"}`}
      initialValues={buildBlobStorageFormValues(
        config ?? undefined,
        exportSourceCtx,
      )}
      exportSourceCtx={exportSourceCtx}
      persistedExportSource={config?.exportSource}
      isSaving={mut.isPending}
      onSubmit={handleSubmit}
    >
      <Button
        variant="secondary"
        loading={mutValidate.isPending}
        disabled={!config}
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
        disabled={!config?.enabled}
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
        disabled={!config}
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
    </BlobStorageIntegrationForm>
  );
};
