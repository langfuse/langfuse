import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import {
  IntegrationSettingsSkeleton,
  buildExportSourceContext,
} from "@/src/features/analytics-integrations";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import {
  type V4WriteMode,
  type BlobStorageIntegration,
  type ExportSourceContext,
} from "@langfuse/shared";
import { type BlobStorageIntegrationFormSchema } from "@/src/features/blobstorage-integration/types";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useQueryProject } from "@/src/features/projects";
import { buildBlobStorageFormValues } from "@/src/features/blobstorage-integration/components/formValues";
import { BlobStorageIntegrationForm } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationForm";
import { TestMediaObjectDialog } from "@/src/features/blobstorage-integration/components/TestMediaObjectDialog";
import { testSignedMediaUrlCors } from "@/src/features/blobstorage-integration/fns/testSignedMediaUrlCors";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

// State layer. Owns everything async and entity-scoped: availability
// derivation, mutations, and the entity-action buttons. The form
// below it is a disposable draft: it is not mounted until every input has
// resolved, and it is remounted (via key) whenever the entity identity
// changes — project switch, create, delete. Background refetches of the
// same entity (status poll, post-save invalidation) keep the key stable so
// they can never touch a draft in progress.
export const BlobStorageIntegrationContainer = ({
  config,
  projectId,
  writeMode,
  showMediaStorage,
  onDeleted,
  onSaved,
}: {
  config: Partial<BlobStorageIntegration> | null;
  projectId: string;
  writeMode: V4WriteMode;
  showMediaStorage: boolean;
  onDeleted: () => void;
  onSaved: (integrationId: string) => void;
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

  const utils = api.useUtils();
  const mut = api.blobStorageIntegration.update.useMutation({
    onSuccess: (integration) => {
      utils.blobStorageIntegration.invalidate();
      onSaved(integration.id);
    },
    onError: (error) => {
      showErrorToast("Failed to save integration", error.message);
    },
  });
  const mutDelete = api.blobStorageIntegration.delete.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
      onDeleted();
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
  const mutTestMediaObject =
    api.blobStorageIntegration.testExternalMediaObject.useMutation();

  // The form is never mounted before its inputs resolve, so there is no
  // mid-flight reset to protect a draft from. The page already gates on the
  // integration query; only the separate project query can still be pending.
  if (!project) {
    return <IntegrationSettingsSkeleton />;
  }

  const handleSubmit = (values: BlobStorageIntegrationFormSchema) => {
    capture("integrations:blob_storage_form_submitted");
    mut.mutate({
      projectId,
      integrationId: config?.id,
      ...values,
    });
  };
  const isUnsaved = !config?.id;
  const integrationId = config?.id;

  const scheduledExportTestButton = (
    <Button
      type="button"
      variant="secondary"
      aria-label="Test scheduled export upload"
      loading={mutValidate.isPending}
      disabled={isUnsaved}
      title={
        isUnsaved
          ? undefined
          : "Test your saved configuration by uploading a small test file to your storage"
      }
      onClick={() => {
        if (config?.id) {
          mutValidate.mutate({ projectId, integrationId: config.id });
        }
      }}
    >
      Test
    </Button>
  );
  const runNowButton = (
    <Button
      type="button"
      variant="secondary"
      loading={mutRunNow.isPending}
      disabled={!config?.enabled}
      title={
        isUnsaved
          ? undefined
          : "Trigger an immediate export of all data since the last sync"
      }
      onClick={() => {
        if (
          confirm(
            "Are you sure you want to run the blob storage export now? This will export all data since the last sync.",
          )
        )
          config?.id &&
            mutRunNow.mutate({ projectId, integrationId: config.id });
      }}
    >
      Run now
    </Button>
  );
  const mediaStorageTestButton = (
    <Button
      type="button"
      variant="secondary"
      aria-label="Test external media object"
      disabled={!config?.mediaStorageEnabled}
      title={isUnsaved ? undefined : "Test an external media object"}
    >
      Test
    </Button>
  );

  return (
    <BlobStorageIntegrationForm
      // Draft lifetime = entity identity. Deliberately NOT updatedAt:
      // exists→exists refetches (5s status poll, post-update refetch) must
      // not remount, so mid-save typing survives. Delete flips
      // configured→new and remounts blank; create flips new→configured and
      // remounts from the saved row (clearing stale dirty flags).
      key={`${projectId}:${config?.id ?? "new"}`}
      initialValues={buildBlobStorageFormValues(
        config ?? undefined,
        exportSourceCtx,
      )}
      exportSourceCtx={exportSourceCtx}
      persistedExportSource={config?.exportSource}
      isSaving={mut.isPending}
      showMediaStorage={showMediaStorage}
      onSubmit={handleSubmit}
      scheduledExportActions={
        <>
          {isUnsaved ? (
            <Tooltip
              label="Save the integration before testing."
              hoverableContent={false}
            >
              {({ getTriggerProps }) => (
                <span
                  {...getTriggerProps()}
                  className="inline-flex cursor-not-allowed"
                  tabIndex={0}
                >
                  {scheduledExportTestButton}
                </span>
              )}
            </Tooltip>
          ) : (
            scheduledExportTestButton
          )}
          {isUnsaved ? (
            <Tooltip
              label="Save the integration before running an export."
              hoverableContent={false}
            >
              {({ getTriggerProps }) => (
                <span
                  {...getTriggerProps()}
                  className="inline-flex cursor-not-allowed"
                  tabIndex={0}
                >
                  {runNowButton}
                </span>
              )}
            </Tooltip>
          ) : (
            runNowButton
          )}
        </>
      }
      mediaStorageActions={
        <DialogController
          renderDialog={() => (
            <TestMediaObjectDialog
              isPending={mutTestMediaObject.isPending}
              onTest={async (uri) => {
                if (!config?.id) return null;
                try {
                  const { signedUrl } = await mutTestMediaObject.mutateAsync({
                    projectId,
                    integrationId: config.id,
                    uri,
                  });
                  try {
                    await testSignedMediaUrlCors(signedUrl);
                  } catch (error) {
                    showErrorToast(
                      "CORS validation failed",
                      error instanceof Error
                        ? error.message
                        : "The browser could not access the signed URL.",
                    );
                    return null;
                  }
                  showSuccessToast({
                    title: "Media object is accessible",
                    description:
                      "Server-side storage access and browser CORS access succeeded.",
                  });
                  return signedUrl;
                } catch (error) {
                  showErrorToast(
                    "Storage access failed",
                    error instanceof Error
                      ? error.message
                      : "The media object could not be read.",
                  );
                  return null;
                }
              }}
            />
          )}
        >
          {({ openDialog }) => (
            <>
              {isUnsaved ? (
                <Tooltip
                  label="Save the integration before testing."
                  hoverableContent={false}
                >
                  {({ getTriggerProps }) => (
                    <span
                      {...getTriggerProps()}
                      className="inline-flex cursor-not-allowed"
                      tabIndex={0}
                    >
                      {mediaStorageTestButton}
                    </span>
                  )}
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  aria-label="Test external media object"
                  disabled={!config?.mediaStorageEnabled}
                  title="Test an external media object"
                  onClick={openDialog}
                >
                  Test
                </Button>
              )}
            </>
          )}
        </DialogController>
      }
      deleteAction={
        integrationId ? (
          <ConfirmationDialogController
            title="Delete blob storage integration?"
            text="This removes the saved integration configuration. Objects already stored in the bucket are not deleted."
            confirmLabel="Delete integration"
            variant="destructive"
            loading={mutDelete.isPending}
            onConfirm={() =>
              mutDelete.mutateAsync({
                projectId,
                integrationId,
              })
            }
          >
            {({ openDialog }) => (
              <Button type="button" variant="destructive" onClick={openDialog}>
                Delete integration
              </Button>
            )}
          </ConfirmationDialogController>
        ) : null
      }
    />
  );
};
