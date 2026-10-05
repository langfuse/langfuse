import ContainerPage from "@/src/components/layouts/container-page";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/router";
import { useHasEntitlement } from "@/src/features/entitlements";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, type RouterOutputs } from "@/src/utils/api";
import { deriveSyncStatus } from "@/src/features/blobstorage-integration/deriveSyncStatus";
import { BlobStorageSettingsContent } from "@/src/features/blobstorage-integration/components/BlobStorageSettingsContent";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { ArrowLeft, Plus } from "lucide-react";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";

const syncStatusFromConfig = (
  config: RouterOutputs["blobStorageIntegration"]["get"]["configs"][number],
) =>
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

  const showDetails = Boolean(integrationId);

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
          </>
        ),
        actionButtonsRight: (
          <>
            <Button asChild variant="secondary">
              <Link
                href="https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage"
                target="_blank"
              >
                Integration Docs ↗
              </Link>
            </Button>
            {!showDetails && (
              <Button onClick={() => openIntegration("new")}>
                <Plus className="mr-1 size-4" aria-hidden="true" />
                Add integration
              </Button>
            )}
          </>
        ),
      }}
    >
      <p className="text-primary mb-4 text-sm">
        Configure blob storage destinations for scheduled exports
        {showMediaStorage ? " and external media rendering" : ""}.
      </p>
      <BlobStorageSettingsContent
        projectId={projectId}
        integrationId={integrationId}
        hasAccess={hasAccess}
        hasEntitlement={hasEntitlement}
        data={state.data}
        showMediaStorage={showMediaStorage}
        deleteAction={{
          isPending: deleteIntegration.isPending,
          error: deleteIntegration.error?.message,
          reset: deleteIntegration.reset,
          execute: (integrationId) =>
            deleteIntegration.mutateAsync({ projectId, integrationId }),
        }}
        onOpenIntegration={openIntegration}
        onCloseIntegration={closeIntegration}
      />
    </ContainerPage>
  );
}
