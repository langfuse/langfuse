import { useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
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
  parquetEnabledFromTuning,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { buildBlobStorageFormValues } from "@/src/features/blobstorage-integration/components/formValues";
import { BlobStorageIntegrationForm } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationForm";

// State layer. Owns everything async and entity-scoped: availability
// derivation, the four mutations, and the entity-action buttons. The form
// below it is a disposable draft: it is not mounted until every input has
// resolved, and it is remounted (via key) whenever the entity identity
// changes — project switch, create, delete — or the user explicitly reloads
// after a concurrent edit. Background refetches of the same entity (status
// poll, post-save invalidation) keep the key stable so they can never touch
// a draft in progress.
export const BlobStorageIntegrationContainer = ({
  config,
  projectId,
  isLoading,
  isEnrichedExportAvailable,
}: {
  config: Partial<BlobStorageIntegration> | null;
  projectId: string;
  isLoading: boolean;
  isEnrichedExportAvailable: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { project } = useQueryProject();

  // The container survives a client-side project switch; mutation callbacks
  // compare the projectId they were fired with against the live prop and
  // skip UI feedback when they no longer match (stale resolution).
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const isPostCutoffCloud =
    project?.createdAt != null &&
    !isLegacyBlobExportAllowed(new Date(project.createdAt), isLangfuseCloud);
  const eventsExportAvailable = isEnrichedExportAvailable;
  // Integration-level cutoff (Cloud only): a row predating the exporter cutoff
  // keeps legacy options; a new or post-cutoff row is locked to EVENTS.
  const isLegacyExporter = isLegacyBlobExporter(
    config?.createdAt ? new Date(config.createdAt) : null,
    isLangfuseCloud,
  );
  const forceEventsExport =
    isPostCutoffCloud || (eventsExportAvailable && !isLegacyExporter);
  const availability = useMemo(
    () => ({ eventsExportAvailable, forceEventsExport }),
    [eventsExportAvailable, forceEventsExport],
  );

  // Concurrent-edit drift detection. The form freezes a snapshot at mount;
  // `snapshot` records which entity identity and updatedAt that snapshot was
  // built from. A differing refetched updatedAt on the SAME identity means
  // someone else saved — surface a banner, never discard the draft without
  // an explicit click. `epoch` remounts the form on that click.
  const identity = `${projectId}:${config ? "configured" : "new"}`;
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    updatedAt: Date | null;
    epoch: number;
  }>({ identity, updatedAt: config?.updatedAt ?? null, epoch: 0 });
  // Own-save tracking. `inFlight` is set from onMutate so a poll refetch
  // that races ahead of the mutation response cannot flash the banner for
  // the user's own change. onSuccess records the exact updatedAt the save
  // wrote, and ONLY that value is adopted silently (remount from the saved
  // row, clearing dirty flags) — any other new updatedAt is a genuine
  // concurrent edit and still banners, so a leftover expectation can never
  // swallow an external edit.
  const [selfSave, setSelfSave] = useState<{
    inFlight: boolean;
    expectedUpdatedAt: number | null;
  }>({ inFlight: false, expectedUpdatedAt: null });

  // Render-phase state adjustment (React's derive-state-from-props pattern):
  // identity changes rebaseline the snapshot before anything is compared.
  if (snapshot.identity !== identity) {
    setSnapshot({ identity, updatedAt: config?.updatedAt ?? null, epoch: 0 });
    if (selfSave.inFlight || selfSave.expectedUpdatedAt != null)
      setSelfSave({ inFlight: false, expectedUpdatedAt: null });
  }

  const configUpdatedAt = config?.updatedAt
    ? new Date(config.updatedAt).getTime()
    : null;
  const snapshotUpdatedAt = snapshot.updatedAt
    ? new Date(snapshot.updatedAt).getTime()
    : null;
  const updatedAtChanged =
    snapshot.identity === identity &&
    configUpdatedAt != null &&
    snapshotUpdatedAt != null &&
    configUpdatedAt !== snapshotUpdatedAt;

  if (
    updatedAtChanged &&
    selfSave.expectedUpdatedAt != null &&
    configUpdatedAt === selfSave.expectedUpdatedAt
  ) {
    setSnapshot({
      identity,
      updatedAt: config?.updatedAt ?? null,
      epoch: snapshot.epoch + 1,
    });
    setSelfSave({ inFlight: false, expectedUpdatedAt: null });
  }
  const hasDrift =
    updatedAtChanged &&
    !selfSave.inFlight &&
    configUpdatedAt !== selfSave.expectedUpdatedAt;

  const utils = api.useUtils();
  // invalidate() stays unguarded everywhere: the query cache is keyed per
  // projectId, so refreshing the fired-for project in the background is
  // correct even after a switch.
  const mut = api.blobStorageIntegration.update.useMutation({
    onMutate: () => {
      setSelfSave({ inFlight: true, expectedUpdatedAt: null });
    },
    onSuccess: (data, variables) => {
      utils.blobStorageIntegration.invalidate();
      if (variables.projectId !== projectIdRef.current) {
        setSelfSave({ inFlight: false, expectedUpdatedAt: null }); // stale
        return;
      }
      setSelfSave({
        inFlight: false,
        expectedUpdatedAt: data?.updatedAt
          ? new Date(data.updatedAt).getTime()
          : null,
      });
    },
    onError: (error, variables) => {
      setSelfSave({ inFlight: false, expectedUpdatedAt: null });
      if (variables.projectId !== projectIdRef.current) return; // stale
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
    onSuccess: (data, variables) => {
      if (variables.projectId !== projectIdRef.current) return; // stale
      showSuccessToast({
        title: data.message,
        description: `Test file: ${data.testFileName}`,
      });
    },
    onError: (error, variables) => {
      if (variables.projectId !== projectIdRef.current) return; // stale
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
    <>
      {hasDrift && (
        <Alert className="mb-4">
          <AlertTitle>Configuration changed elsewhere</AlertTitle>
          <AlertDescription>
            The saved configuration was updated in another tab or by another
            user. Your unsaved edits are kept until you reload.
            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setSnapshot({
                    identity,
                    updatedAt: config?.updatedAt ?? null,
                    epoch: snapshot.epoch + 1,
                  })
                }
              >
                Reload form (discards unsaved edits)
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <BlobStorageIntegrationForm
        // Draft lifetime = entity identity (+ explicit reload epoch).
        // Deliberately NOT updatedAt: exists→exists refetches (5s status
        // poll, post-update refetch) must not remount, so mid-save typing
        // survives. Delete flips configured→new and remounts blank; create
        // flips new→configured and remounts from the saved row (clearing
        // stale dirty flags).
        key={`${identity}:${snapshot.epoch}`}
        initialValues={buildBlobStorageFormValues(
          config ?? undefined,
          availability,
        )}
        availability={availability}
        persistedExportSource={config?.exportSource}
        isParquetOverride={parquetEnabledFromTuning(config?.exportTuning)}
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
    </>
  );
};
