import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations/components/IntegrationSettingsSkeleton";
import { buildExportSourceContext } from "@/src/features/analytics-integrations/exportSource";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import {
  type V4WriteMode,
  type BlobStorageIntegration,
  type ExportSourceContext,
} from "@langfuse/shared";
import { type BlobStorageIntegrationFormSchema } from "@/src/features/blobstorage-integration/types";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import {
  buildBlobStorageFormValues,
  toStoredFieldGroups,
} from "@/src/features/blobstorage-integration/components/formValues";
import { BlobStorageIntegrationForm } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationForm";
import { useBlobStorageExternalId } from "@/src/features/blobstorage-integration/useBlobStorageExternalId";
import { RoleAuthPausedDialog } from "@/src/features/blobstorage-integration/components/RoleAuthPausedDialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

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
  writeMode,
  crossAccountRoleArn,
  roleAuthRequiresUpgrade,
}: {
  config:
    | (Partial<Omit<BlobStorageIntegration, "externalId">> & {
        hasSecretAccessKey?: boolean;
        hasExternalId?: boolean;
      })
    | null;
  projectId: string;
  writeMode: V4WriteMode;
  // Set when this deployment supports IAM role auth.
  crossAccountRoleArn: string | null;
  roleAuthRequiresUpgrade: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { project } = useQueryProject();

  // Policy context for the export-source selector; the policy itself lives in
  // export-source-policy.ts. null integrationCreatedAt = new row.
  const projectCreatedAt = project?.createdAt;
  const integrationCreatedAt = config?.createdAt;
  const exportSourceCtx: ExportSourceContext = useMemo(
    () =>
      buildExportSourceContext({
        writeMode,
        isCloud: isLangfuseCloud,
        projectCreatedAt: projectCreatedAt
          ? new Date(projectCreatedAt)
          : undefined,
        integrationCreatedAt: integrationCreatedAt
          ? new Date(integrationCreatedAt)
          : null,
      }),
    [isLangfuseCloud, writeMode, projectCreatedAt, integrationCreatedAt],
  );

  const externalId = useBlobStorageExternalId(
    projectId,
    Boolean(config?.hasExternalId),
  );

  const utils = api.useUtils();
  const mut = api.blobStorageIntegration.update.useMutation({
    // Returned so per-call onSuccess runs after the refetch, when `config`
    // knows the new external ID exists. Saving can replace or remove the
    // external ID, so its cached value is cleared first.
    onSuccess: async () => {
      await utils.blobStorageIntegration.getExternalId.reset({ projectId });
      await utils.blobStorageIntegration.invalidate();
    },
    onError: (error) => {
      showErrorToast(
        "Failed to save integration",
        error.message,
        classifyTrpcToastError(error, "blob_storage.save"),
      );
    },
  });
  const mutDelete = api.blobStorageIntegration.delete.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.getExternalId.reset({ projectId });
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
        operation: "blob_storage.validate",
        title: data.message,
        description: `Test file: ${data.testFileName}`,
      });
    },
    onError: (error) => {
      showErrorToast(
        "Validation failed",
        error.message,
        classifyTrpcToastError(error, "blob_storage.validate"),
      );
    },
  });

  // The form is never mounted before its inputs resolve, so there is no
  // mid-flight reset to protect a draft from. The page already gates on the
  // integration query; only the separate project query can still be pending.
  if (!project) {
    return <IntegrationSettingsSkeleton />;
  }

  // A save that mints a new external ID comes back disabled; see the service.
  const handleSubmit = (
    values: BlobStorageIntegrationFormSchema,
    onSaved: (saved: { enabled: boolean }) => void,
    openPausedDialog: () => void,
  ) => {
    capture("integrations:blob_storage_form_submitted");
    mut.mutate(
      {
        projectId,
        ...values,
        exportFieldGroups: toStoredFieldGroups(values.exportFieldGroups),
      },
      {
        onSuccess: (saved) => {
          onSaved(saved);
          if (values.enabled && !saved.enabled) openPausedDialog();
        },
      },
    );
  };

  const renderForm = (openPausedDialog: () => void) => (
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
      crossAccountRoleArn={crossAccountRoleArn}
      roleAuthRequiresUpgrade={roleAuthRequiresUpgrade}
      externalId={externalId}
      isSaving={mut.isPending}
      onSubmit={(values, onSaved) =>
        handleSubmit(values, onSaved, openPausedDialog)
      }
    >
      {({ isDirty }) => (
        <>
          <Button
            variant="secondary"
            loading={mutValidate.isPending}
            disabled={!config || isDirty}
            title={
              isDirty
                ? "Please save latest changes before validate"
                : "Test your saved configuration by uploading a small test file to your storage"
            }
            onClick={() => {
              mutValidate.mutate({ projectId });
            }}
          >
            Validate
          </Button>
          <Button
            variant="secondary"
            loading={mutRunNow.isPending}
            disabled={!config?.enabled || isDirty}
            title={
              isDirty
                ? "Please save latest changes before running an export"
                : "Trigger an immediate export of all data since the last sync"
            }
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
        </>
      )}
    </BlobStorageIntegrationForm>
  );

  return (
    <DialogController renderDialog={() => <RoleAuthPausedDialog />}>
      {({ openDialog }) => renderForm(openDialog)}
    </DialogController>
  );
};
