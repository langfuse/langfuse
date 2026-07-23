import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";
import { deriveSyncStatus } from "@/src/features/blobstorage-integration/deriveSyncStatus";
import { type BlobStorageSyncStatus } from "@/src/features/blobstorage-integration/types";
import { BlobStorageIntegrationContainer } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationContainer";
import { BlobStorageStatusSection } from "@/src/features/blobstorage-integration/components/BlobStorageStatusSection";

const syncStatusToBadge: Record<BlobStorageSyncStatus, string> = {
  up_to_date: "active",
  running: "running",
  queued: "queued",
  idle: "pending",
  disabled: "disabled",
  error: "error",
};

const syncStatusFromConfig = (
  config: NonNullable<RouterOutputs["blobStorageIntegration"]["get"]["config"]>,
): BlobStorageSyncStatus =>
  deriveSyncStatus({
    enabled: config.enabled,
    lastError: config.lastError,
    lastSyncAt: config.lastSyncAt ? new Date(config.lastSyncAt) : null,
    nextSyncAt: config.nextSyncAt ? new Date(config.nextSyncAt) : null,
    runStartedAt: config.runStartedAt ? new Date(config.runStartedAt) : null,
  });

export default function BlobStorageIntegrationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const state = api.blobStorageIntegration.get.useQuery(
    { projectId },
    {
      enabled: hasAccess,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
      refetchInterval: (query) => {
        const cfg = query.state.data?.config;
        if (!cfg) return false;
        const status = syncStatusFromConfig(cfg);
        return status === "running" || status === "queued" ? 5_000 : false;
      },
    },
  );

  const syncStatus =
    state.isLoading || !hasAccess || !state.data?.config
      ? undefined
      : syncStatusFromConfig(state.data.config);

  return (
    <ContainerPage
      headerProps={{
        title: "Blob Storage Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: (
          <>
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
        Configure scheduled exports of your trace data to AWS S3, S3-compatible
        storages, or Azure Blob Storage. Set up a hourly, daily, or weekly
        export to your own storage for data analysis or backup purposes. Use the
        &quot;Validate&quot; button to test your configuration by uploading a
        small test file, and the &quot;Run Now&quot; button to trigger an
        immediate export.
      </p>
      {!hasAccess && (
        <p className="text-sm">
          Your current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      )}
      {state.data?.config && (
        <BlobStorageStatusSection config={state.data.config} />
      )}
      {hasAccess && (
        <>
          <Header title="Configuration" className="mt-8" />
          <Card className="p-3">
            <BlobStorageIntegrationContainer
              config={state.data?.config ?? null}
              projectId={projectId}
              isLoading={state.isLoading}
              isEnrichedExportAvailable={
                state.data?.isEnrichedExportAvailable ?? false
              }
              legacyWritesActive={state.data?.legacyWritesActive ?? true}
            />
          </Card>
        </>
      )}
    </ContainerPage>
  );
}
