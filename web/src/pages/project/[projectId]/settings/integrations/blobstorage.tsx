import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations/components/IntegrationSettingsSkeleton";
import Link from "next/link";
import { useRouter } from "next/router";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";
import { deriveSyncStatus } from "@/src/features/blobstorage-integration/deriveSyncStatus";
import { type BlobStorageSyncStatus } from "@/src/features/blobstorage-integration/types";
import { BlobStorageIntegrationContainer } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationContainer";
import { BlobStorageStatusSection } from "@/src/features/blobstorage-integration/components/BlobStorageStatusSection";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("integrationsSettings");
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const hasEntitlement = useHasEntitlement("scheduled-blob-exports");
  const canLoadConfig = hasAccess && hasEntitlement;
  const state = api.blobStorageIntegration.get.useQuery(
    { projectId },
    {
      enabled: canLoadConfig,
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
    state.isLoading || !canLoadConfig || !state.data?.config
      ? undefined
      : syncStatusFromConfig(state.data.config);

  return (
    <ContainerPage
      headerProps={{
        title: t("blobStorage.title"),
        breadcrumb: [
          {
            name: t("common.settings"),
            href: `/project/${projectId}/settings`,
          },
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
              {t("common.integrationDocs")}
            </Link>
          </Button>
        ),
      }}
    >
      <p className="text-primary mb-4 text-sm">
        {t("blobStorage.description")}
      </p>
      {!hasEntitlement ? (
        <p className="text-sm">{t("blobStorage.planUnavailable")}</p>
      ) : !hasAccess ? (
        <p className="text-sm">{t("common.accessDenied")}</p>
      ) : (
        <>
          {state.data?.config && (
            <BlobStorageStatusSection config={state.data.config} />
          )}
          <Header title={t("common.configuration")} className="mt-8" />
          <Card className="p-3">
            {!state.data ? (
              <IntegrationSettingsSkeleton />
            ) : (
              <BlobStorageIntegrationContainer
                config={state.data.config ?? null}
                projectId={projectId}
                writeMode={state.data.writeMode}
              />
            )}
          </Card>
        </>
      )}
    </ContainerPage>
  );
}
