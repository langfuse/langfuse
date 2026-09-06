import { useMemo } from "react";
import { Button } from "@/src/components/ui/button";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations/components/IntegrationSettingsSkeleton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import {
  type V4WriteMode,
  type BlobStorageIntegration,
  type ExportSourceContext,
} from "@langfuse/shared";
import { buildExportSourceContext } from "@/src/features/analytics-integrations/exportSource";
import { type BlobStorageIntegrationFormSchema } from "@/src/features/blobstorage-integration/types";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { buildBlobStorageFormValues } from "@/src/features/blobstorage-integration/components/formValues";
import { BlobStorageIntegrationForm } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationForm";
import { useTranslations } from "next-intl";

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
}: {
  config: Partial<BlobStorageIntegration> | null;
  projectId: string;
  writeMode: V4WriteMode;
}) => {
  const t = useTranslations("settingsEnterprise.blobActions");
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
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
    },
    onError: (error) => {
      showErrorToast(t("saveFailed"), error.message);
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
        title: t("validationSuccess"),
        description: t("testFile", { fileName: data.testFileName }),
      });
    },
    onError: (error) => {
      showErrorToast(t("validationFailed"), error.message);
    },
  });

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
        title={t("validateTooltip")}
        onClick={() => {
          mutValidate.mutate({ projectId });
        }}
      >
        {t("validate")}
      </Button>
      <Button
        variant="secondary"
        loading={mutRunNow.isPending}
        disabled={!config?.enabled}
        title={t("runNowTooltip")}
        onClick={() => {
          if (confirm(t("runNowConfirm"))) mutRunNow.mutate({ projectId });
        }}
      >
        {t("runNow")}
      </Button>
      <Button
        variant="ghost"
        loading={mutDelete.isPending}
        disabled={!config}
        onClick={() => {
          if (confirm(t("resetConfirm"))) mutDelete.mutate({ projectId });
        }}
      >
        {t("reset")}
      </Button>
    </BlobStorageIntegrationForm>
  );
};
