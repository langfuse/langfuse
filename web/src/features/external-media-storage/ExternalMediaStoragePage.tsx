import Link from "next/link";
import { useRouter } from "next/router";

import ContainerPage from "@/src/components/layouts/container-page";
import Header from "@/src/components/layouts/header";
import { Button as DesignSystemButton } from "@/src/components/design-system/Button/Button";
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
import { useHasProjectAccess } from "@/src/features/rbac";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

const EXTERNAL_MEDIA_STORAGE_FORM_ID = "external-media-storage-form";

const defaultValues: ExternalMediaStorageFormValues = {
  type: "S3",
  bucketName: "",
  endpoint: null,
  region: "us-east-1",
  accessKeyId: "",
  secretAccessKey: "",
  prefix: "",
  forcePathStyle: false,
};

export default function ExternalMediaStoragePage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const featureAvailability =
    api.externalMediaStorage.isFeatureEnabled.useQuery(
      { projectId },
      { enabled: Boolean(projectId) },
    );
  const isFeatureEnabled = featureAvailability.data === true;
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
        operation: "external_media_storage.save",
        title: "External media storage saved",
        description: "The integration configuration has been saved.",
      });
    },
    onError: (error) => {
      showErrorToast(
        "Failed to save external media storage",
        error.message,
        classifyTrpcToastError(error, "external_media_storage.save"),
      );
    },
  });
  const deleteMutation = api.externalMediaStorage.delete.useMutation({
    onSuccess: async () => {
      await utils.externalMediaStorage.get.invalidate({ projectId });
      showSuccessToast({
        operation: "external_media_storage.delete",
        title: "External media storage deleted",
        description: "The integration configuration has been deleted.",
      });
    },
    onError: (error) => {
      showErrorToast(
        "Failed to delete external media storage",
        error.message,
        classifyTrpcToastError(error, "external_media_storage.delete"),
      );
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
        forcePathStyle: config.forcePathStyle,
      }
    : defaultValues;

  const renderTestAction = () => {
    if (config) {
      return (
        <DialogController
          renderDialog={() => (
            <TestMediaObjectDialog
              isPending={testMutation.isPending}
              onTest={async (uri) => {
                let failureOrigin: "trpc" | "network" = "trpc";
                try {
                  const result = await testMutation.mutateAsync({
                    projectId,
                    uri,
                  });
                  failureOrigin = "network";
                  await testSignedMediaUrlCors(result.signedUrl);
                  return result.signedUrl;
                } catch (error) {
                  showErrorToast(
                    "External media test failed",
                    error instanceof Error
                      ? error.message
                      : "The media object could not be loaded.",
                    failureOrigin === "trpc"
                      ? classifyTrpcToastError(
                          error,
                          "external_media_storage.test",
                        )
                      : {
                          operation: "external_media_storage.test",
                          errorOrigin: "network",
                          errorCategory: "transient",
                        },
                  );
                  return null;
                }
              }}
            />
          )}
        >
          {({ openDialog }) => (
            <DesignSystemButton
              text="Test"
              variant="secondary"
              onClick={openDialog}
            />
          )}
        </DialogController>
      );
    }

    if (!config) {
      return (
        <Tooltip label="Save the integration before running the validation.">
          {({ getTriggerProps }) => (
            <span {...getTriggerProps()}>
              <DesignSystemButton text="Test" variant="secondary" disabled />
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
        actionButtonsRight: (
          <Button asChild variant="secondary">
            <Link
              href="https://langfuse.com/docs/observability/features/multi-modality#external-s3-media"
              target="_blank"
            >
              Integration Docs ↗
            </Link>
          </Button>
        ),
      }}
    >
      <p className="text-primary mb-4 text-sm">
        Resolve media referenced by s3:// URIs from your own Amazon S3 or
        S3-compatible bucket.
      </p>
      {(() => {
        if (featureAvailability.isPending) {
          return <IntegrationSettingsSkeleton />;
        }

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
            {configuration.isLoading || !configuration.data ? (
              <Card className="p-3">
                <IntegrationSettingsSkeleton />
              </Card>
            ) : (
              <ExternalMediaStorageForm
                key={config?.updatedAt?.toString() ?? "new"}
                formId={EXTERNAL_MEDIA_STORAGE_FORM_ID}
                initialValues={initialValues}
                secretAccessKeyDisplay={config?.secretAccessKeyDisplay}
                onSubmit={(values) =>
                  updateMutation.mutate({ projectId, ...values })
                }
                renderActions={({ isDirty }) => (
                  <>
                    {renderTestAction()}
                    {config ? (
                      <ConfirmationDialogController
                        title="Delete external media storage?"
                        text="Media stored in this bucket will no longer be resolved in Langfuse."
                        confirmLabel="Delete"
                        variant="destructive"
                        loading={deleteMutation.isPending}
                        onConfirm={() =>
                          deleteMutation.mutateAsync({ projectId })
                        }
                      >
                        {({ openDialog }) => (
                          <DesignSystemButton
                            text="Delete"
                            variant="destructive"
                            onClick={openDialog}
                          />
                        )}
                      </ConfirmationDialogController>
                    ) : null}
                    {!isDirty ? (
                      <Tooltip label="Make a change before saving.">
                        {({ getTriggerProps }) => (
                          <span {...getTriggerProps()}>
                            <DesignSystemButton
                              text="Save"
                              form={EXTERNAL_MEDIA_STORAGE_FORM_ID}
                              type="submit"
                              disabled
                            />
                          </span>
                        )}
                      </Tooltip>
                    ) : (
                      <DesignSystemButton
                        text="Save"
                        form={EXTERNAL_MEDIA_STORAGE_FORM_ID}
                        type="submit"
                        loading={updateMutation.isPending}
                      />
                    )}
                  </>
                )}
              />
            )}
          </>
        );
      })()}
    </ContainerPage>
  );
}
