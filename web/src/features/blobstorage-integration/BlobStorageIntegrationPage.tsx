import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations";
import Link from "next/link";
import { useRouter } from "next/router";
import { useHasEntitlement } from "@/src/features/entitlements";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, type RouterOutputs } from "@/src/utils/api";
import { deriveSyncStatus } from "@/src/features/blobstorage-integration/deriveSyncStatus";
import { type BlobStorageSyncStatus } from "@/src/features/blobstorage-integration/types";
import { BlobStorageIntegrationContainer } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationContainer";
import { BlobStorageStatusSection } from "@/src/features/blobstorage-integration/components/BlobStorageStatusSection";
import { BlobStorageIntegrationTable } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationTable";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { ArrowLeft } from "lucide-react";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";

const syncStatusToBadge: Record<BlobStorageSyncStatus, string> = {
  up_to_date: "active",
  running: "running",
  queued: "queued",
  idle: "pending",
  disabled: "disabled",
  error: "error",
};

const syncStatusFromConfig = (
  config: RouterOutputs["blobStorageIntegration"]["get"]["configs"][number],
): BlobStorageSyncStatus =>
  deriveSyncStatus({
    enabled: config.enabled,
    lastError: config.lastError,
    lastSyncAt: config.lastSyncAt ? new Date(config.lastSyncAt) : null,
    nextSyncAt: config.nextSyncAt ? new Date(config.nextSyncAt) : null,
    runStartedAt: config.runStartedAt ? new Date(config.runStartedAt) : null,
  });

export default function BlobStorageIntegrationPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const hasEntitlement = useHasEntitlement("scheduled-blob-exports");
  const showMediaStorage = useIsFeatureEnabled("externalMediaStorage", {
    enableForAdmins: false,
    projectId,
  });
  const canLoadConfig = hasAccess && hasEntitlement;
  const integrationId =
    typeof router.query.integrationId === "string"
      ? router.query.integrationId
      : undefined;
  const state = api.blobStorageIntegration.get.useQuery(
    { projectId },
    {
      enabled: canLoadConfig,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
      refetchInterval: (query) => {
        const hasRunningIntegration = query.state.data?.configs.some(
          (config) => {
            const status = syncStatusFromConfig(config);
            return status === "running" || status === "queued";
          },
        );
        return hasRunningIntegration ? 5_000 : false;
      },
    },
  );
  const utils = api.useUtils();
  const deleteIntegration = api.blobStorageIntegration.delete.useMutation({
    onSuccess: async () => {
      await utils.blobStorageIntegration.invalidate();
      showSuccessToast({
        title: "Blob storage integration deleted",
        description: "The integration was removed from this project.",
      });
    },
    onError: (error) => {
      showErrorToast(
        "Failed to delete blob storage integration",
        error.message,
      );
    },
  });

  const selectedConfig =
    integrationId === "new"
      ? null
      : state.data?.configs.find((config) => config.id === integrationId);
  const showDetails = Boolean(integrationId);
  const syncStatus =
    state.isLoading || !canLoadConfig || !selectedConfig
      ? undefined
      : syncStatusFromConfig(selectedConfig);

  const openIntegration = (id: string) => {
    router.push(
      {
        pathname: router.pathname,
        query: { projectId, integrationId: id },
      },
      undefined,
      { shallow: true },
    );
  };

  const closeIntegration = () => {
    router.push(
      { pathname: router.pathname, query: { projectId } },
      undefined,
      { shallow: true },
    );
  };

  const renderSettingsContent = () => {
    if (!hasEntitlement) {
      return (
        <p className="text-sm">
          This feature is not available in your current plan.
        </p>
      );
    }
    if (!hasAccess) {
      return (
        <p className="text-sm">
          Your current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      );
    }
    if (!state.data) return <IntegrationSettingsSkeleton />;
    if (!showDetails) {
      return (
        <ConfirmationDialogController<
          RouterOutputs["blobStorageIntegration"]["get"]["configs"][number]
        >
          title="Delete blob storage integration"
          text={(integration) =>
            `Delete the integration for “${integration.bucketName}”? This action cannot be undone.`
          }
          confirmLabel="Delete integration"
          variant="destructive"
          loading={deleteIntegration.isPending}
          error={deleteIntegration.error?.message}
          onAfterDismiss={deleteIntegration.reset}
          onConfirm={(integration) =>
            deleteIntegration.mutateAsync({
              projectId,
              integrationId: integration.id,
            })
          }
        >
          {({ openDialog }) => (
            <BlobStorageIntegrationTable
              integrations={state.data.configs}
              onSelect={(integration) => openIntegration(integration.id)}
              onCreate={() => openIntegration("new")}
              onDelete={openDialog}
            />
          )}
        </ConfirmationDialogController>
      );
    }
    if (integrationId !== "new" && !selectedConfig) {
      return (
        <Card className="p-4 text-sm">
          This blob storage integration could not be found.
        </Card>
      );
    }

    return (
      <>
        {selectedConfig && <BlobStorageStatusSection config={selectedConfig} />}
        <Header title="Integration details" className="mt-8" />
        <BlobStorageIntegrationContainer
          config={selectedConfig ?? null}
          projectId={projectId}
          writeMode={state.data.writeMode}
          showMediaStorage={showMediaStorage}
          onDeleted={closeIntegration}
          onSaved={openIntegration}
        />
      </>
    );
  };

  return (
    <ContainerPage
      headerProps={{
        title: showDetails ? "Blob Storage Integration" : "Blob Storage",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: (
          <>
            {showDetails && (
              <Button variant="ghost" onClick={closeIntegration}>
                <ArrowLeft className="mr-1 size-4" />
                All integrations
              </Button>
            )}
            {syncStatus && <StatusBadge type={syncStatusToBadge[syncStatus]} />}
          </>
        ),
        actionButtonsRight: (
          <Button asChild variant="secondary">
            <Link
              href="https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage"
              target="_blank"
            >
              Integration Docs ↗
            </Link>
          </Button>
        ),
      }}
    >
      <p className="text-primary mb-4 text-sm">
        Configure blob storage destinations for scheduled exports
        {showMediaStorage ? " and external media rendering" : ""}.
      </p>
      {renderSettingsContent()}
    </ContainerPage>
  );
}
