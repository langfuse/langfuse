import { useRouter } from "next/router";

import { ActionButton } from "@/src/components/ActionButton";
import ContainerPage from "@/src/components/layouts/container-page";
import Header from "@/src/components/layouts/header";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations";
import { ExternalMediaStorageForm } from "@/src/features/external-media-storage/components/ExternalMediaStorageForm/ExternalMediaStorageForm";
import { TestMediaObjectDialog } from "@/src/features/external-media-storage/components/TestMediaObjectDialog/TestMediaObjectDialog";
import { testSignedMediaUrlCors } from "@/src/features/external-media-storage/fns/testSignedMediaUrlCors";
import { type ExternalMediaStorageFormValues } from "@/src/features/external-media-storage/types";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useHasProjectAccess } from "@/src/features/rbac";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

const EXTERNAL_MEDIA_STORAGE_FORM_ID = "external-media-storage-form";

const defaultValues: ExternalMediaStorageFormValues = {
  type: "S3",
  bucketName: "",
  endpoint: null,
  region: "us-east-1",
  accessKeyId: "",
  secretAccessKey: "",
  prefix: "",
  enabled: true,
  forcePathStyle: false,
};

export default function ExternalMediaStoragePage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const isFeatureEnabled = useIsFeatureEnabled("externalMediaStorage", {
    enableForAdmins: false,
    projectId,
  });
  const canLoadConfig = Boolean(projectId && hasAccess && isFeatureEnabled);
  const utils = api.useUtils();
  const configuration = api.externalMediaStorage.get.useQuery(
    { projectId },
    { enabled: canLoadConfig },
  );
  const updateMutation = api.externalMediaStorage.update.useMutation({
    onSuccess: async () => {
      await utils.externalMediaStorage.get.invalidate({ projectId });
      showSuccessToast({
        title: "External media storage saved",
        description: "The integration configuration has been saved.",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to save external media storage", error.message);
    },
  });
  const deleteMutation = api.externalMediaStorage.delete.useMutation({
    onSuccess: async () => {
      await utils.externalMediaStorage.get.invalidate({ projectId });
      showSuccessToast({
        title: "External media storage deleted",
        description: "The integration configuration has been deleted.",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to delete external media storage", error.message);
    },
  });
  const testMutation = api.externalMediaStorage.testObject.useMutation();
  const config = configuration.data?.config;
  const initialValues: ExternalMediaStorageFormValues = config
    ? {
        type: config.type,
        bucketName: config.bucketName,
        endpoint: config.endpoint,
        region: config.region,
        accessKeyId: config.accessKeyId ?? "",
        secretAccessKey: "",
        prefix: config.prefix ?? "",
        enabled: config.enabled,
        forcePathStyle: config.forcePathStyle,
      }
    : defaultValues;

  const renderTestAction = () => {
    if (config?.enabled) {
      return (
        <DialogController
          renderDialog={() => (
            <TestMediaObjectDialog
              isPending={testMutation.isPending}
              onTest={async (uri) => {
                try {
                  const result = await testMutation.mutateAsync({
                    projectId,
                    uri,
                  });
                  await testSignedMediaUrlCors(result.signedUrl);
                  return result.signedUrl;
                } catch (error) {
                  showErrorToast(
                    "External media test failed",
                    error instanceof Error
                      ? error.message
                      : "The media object could not be loaded.",
                  );
                  return null;
                }
              }}
            />
          )}
        >
          {({ openDialog }) => (
            <Button variant="secondary" onClick={openDialog}>
              Test
            </Button>
          )}
        </DialogController>
      );
    }

    if (!config) {
      return (
        <Tooltip label="Save the integration before running the validation.">
          {({ getTriggerProps }) => (
            <span {...getTriggerProps()}>
              <Button variant="secondary" disabled>
                Test
              </Button>
            </span>
          )}
        </Tooltip>
      );
    }

    return null;
  };

  return (
    <ContainerPage
      headerProps={{
        title: "External Media Storage",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
      }}
    >
      <p className="text-primary mb-4 text-sm">
        Resolve media referenced by s3:// URIs from your own Amazon S3 or
        S3-compatible bucket.
      </p>
      {(() => {
        if (!isFeatureEnabled) {
          return (
            <p className="text-sm">
              This feature is not enabled for this project.
            </p>
          );
        }

        if (!hasAccess) {
          return (
            <p className="text-sm">
              Your current role does not grant you access to these settings,
              please reach out to your project admin or owner.
            </p>
          );
        }

        return (
          <>
            <Header title="Configuration" />
            <Card className="p-3">
              {configuration.isLoading || !configuration.data ? (
                <IntegrationSettingsSkeleton />
              ) : (
                <ExternalMediaStorageForm
                  key={config?.updatedAt?.toString() ?? "new"}
                  allowHostCredentials={!isLangfuseCloud}
                  formId={EXTERNAL_MEDIA_STORAGE_FORM_ID}
                  initialValues={initialValues}
                  secretAccessKeyDisplay={config?.secretAccessKeyDisplay}
                  onSubmit={(values) =>
                    updateMutation.mutate({ projectId, ...values })
                  }
                />
              )}
            </Card>
            <div className="mt-3 flex justify-end gap-2">
              {config ? (
                <ConfirmationDialogController
                  title="Delete external media storage?"
                  text="Media stored in this bucket will no longer be resolved in Langfuse."
                  confirmLabel="Delete"
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onConfirm={() => deleteMutation.mutateAsync({ projectId })}
                >
                  {({ openDialog }) => (
                    <ActionButton
                      variant="destructive-secondary"
                      hasAccess={hasAccess}
                      onClick={openDialog}
                    >
                      Delete
                    </ActionButton>
                  )}
                </ConfirmationDialogController>
              ) : null}
              {renderTestAction()}
              <Button
                form={EXTERNAL_MEDIA_STORAGE_FORM_ID}
                type="submit"
                loading={updateMutation.isPending}
                disabled={configuration.isLoading || !configuration.data}
              >
                Save
              </Button>
            </div>
          </>
        );
      })()}
    </ContainerPage>
  );
}
