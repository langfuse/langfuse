/* eslint-disable no-nested-ternary */
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
      {!hasEntitlement ? (
        <p className="text-sm">
          This feature is not available in your current plan.
        </p>
      ) : !hasAccess ? (
        <p className="text-sm">
          Your current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      ) : (
        <>
          {!state.data ? (
            <IntegrationSettingsSkeleton />
          ) : showDetails ? (
            <>
              {selectedConfig && (
                <BlobStorageStatusSection config={selectedConfig} />
              )}
              <Header title="Integration details" className="mt-8" />
              <Card className="p-3">
                <BlobStorageIntegrationContainer
                  config={selectedConfig ?? null}
                  projectId={projectId}
                  writeMode={state.data.writeMode}
                  showMediaStorage={showMediaStorage}
                  onDeleted={closeIntegration}
                  onSaved={openIntegration}
                />
              </Card>
            </>
          ) : (
            <BlobStorageIntegrationTable
              integrations={state.data.configs}
              showMediaStorage={showMediaStorage}
              onSelect={(integration) => openIntegration(integration.id)}
              onCreate={() => openIntegration("new")}
            />
          )}
        </>
      )}
    </ContainerPage>
  );
}
