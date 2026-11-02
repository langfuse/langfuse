import { Plus } from "@langfuse/icons";
import { useRouter } from "next/router";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayConnectionModelsPage } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/GatewayConnectionModelsPage";
import { IngestionDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/components/IngestionDialogController/IngestionDialogController";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { GatewayProvidersTable } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/components/GatewayProvidersTable/GatewayProvidersTable";
import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import { GATEWAY_INGESTION_MODES } from "@/src/features/ai-gateway/constants/gatewayIngestionModes";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, reportNonTrpcError } from "@/src/utils/api";

export type GatewayCredentialsOverviewProps = {
  organizationId: string;
  connectionId: string | undefined;
  config: GatewayConfig | null;
  projects: GatewayProject[];
};

export function GatewayCredentialsOverview({
  organizationId,
  connectionId,
  config,
  projects,
}: GatewayCredentialsOverviewProps) {
  const router = useRouter();
  const connectionsQuery = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: gatewayConnectionsPageSize },
    {
      enabled: !connectionId,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: !connectionId && connectionsQuery.isSuccess },
  );
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const retry = api.aiGateway.retryConnection.useMutation();
  const remove = api.aiGateway.deleteConnection.useMutation();

  const retryConnection = async (connection: GatewayConnection) => {
    try {
      await retry.mutateAsync({
        orgId: organizationId,
        id: connection.id,
      });
      await Promise.all([
        utils.aiGateway.listConnections.invalidate({
          orgId: organizationId,
        }),
        utils.aiGateway.refreshModels.invalidate({
          orgId: organizationId,
        }),
      ]);
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

  const deleteConnection = async (connection: GatewayConnection) => {
    try {
      await remove.mutateAsync({
        orgId: organizationId,
        id: connection.id,
      });
      capture("ai_gateway:provider_credential_deleted", {
        orgId: organizationId,
        provider: connection.provider,
      });
      await Promise.all([
        utils.aiGateway.listConnections.invalidate({
          orgId: organizationId,
        }),
        utils.aiGateway.refreshModels.invalidate({
          orgId: organizationId,
        }),
      ]);
      if (connection.id === connectionId) {
        await router.push(
          `/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway`,
        );
      }
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
      throw error;
    }
  };

  const selectConnection = (connection: GatewayConnection) =>
    router.push(buildGatewayModelsUrl(organizationId, connection.id));

  if (connectionId) {
    return (
      <GatewayConnectionModelsPage
        organizationId={organizationId}
        connectionId={connectionId}
        isDeleting={remove.isPending}
        onDelete={deleteConnection}
      />
    );
  }

  if (connectionsQuery.isPending) {
    return <ProvidersSkeleton />;
  }

  if (connectionsQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Header title={GATEWAY_SETUP.title} />
        <Alert variant="destructive">
          <Alert.Title>Provider credentials could not be loaded</Alert.Title>
          <Alert.Description>
            Retry to manage gateway routing credentials.
          </Alert.Description>
        </Alert>
        <Button
          className="w-fit"
          variant="secondary"
          onClick={() => connectionsQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const allConnections =
    connectionsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const connectionsById = new Map(
    allConnections.map((connection) => [connection.id, connection]),
  );
  const modelCounts: Record<
    string,
    { enabled: number; total: number } | "loading"
  > = modelsQuery.isPending
    ? Object.fromEntries(
        allConnections
          .filter((connection) => connection.status === "ENABLED")
          .map((connection) => [connection.id, "loading"]),
      )
    : Object.fromEntries(
        (modelsQuery.data ?? [])
          .filter((result) => result.success)
          .flatMap((result) => {
            const connection = connectionsById.get(result.connectionId);
            if (!connection) return [];
            const allowedModels = toGatewayAllowedModelsSet(
              connection.allowedModels,
            );
            const enabled = result.models.filter((model) =>
              isGatewayModelAllowed(allowedModels, model),
            ).length;
            return [
              [
                result.connectionId,
                { enabled, total: result.models.length },
              ] as const,
            ];
          }),
      );
  const ingestionMode = GATEWAY_INGESTION_MODES.find(
    (mode) => mode.value === config?.ingestionMode,
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <Header
          title={GATEWAY_SETUP.title}
          actionButtons={
            <div className="flex items-center gap-2">
              <IngestionDialogController
                organizationId={organizationId}
                config={config}
                projects={projects}
              >
                {({ openDialog }) => (
                  <Button variant="outline" onClick={openDialog}>
                    {ingestionMode ? (
                      <>
                        <ingestionMode.icon
                          size="base"
                          __rawClassName="mr-1.5"
                        />
                        Ingestion: {ingestionMode.title}
                      </>
                    ) : (
                      "Set up ingestion"
                    )}
                  </Button>
                )}
              </IngestionDialogController>
              <ProviderDialogController
                organizationId={organizationId}
                surface="overview"
              >
                {({ openAddDialog }) => (
                  <Button onClick={openAddDialog}>
                    <Plus size="base" __rawClassName="mr-1.5" />
                    Add credential
                  </Button>
                )}
              </ProviderDialogController>
            </div>
          }
        />
        <p className="text-muted-foreground text-sm">
          {GATEWAY_SETUP.description}
        </p>
      </div>
      <section className="flex min-h-0 flex-1 flex-col">
        <Header title="Provider credentials" />
        <ConfirmationDialogController<GatewayConnection>
          title="Delete provider credential"
          text={(connection) =>
            `Delete “${connection.name}”? Requests will immediately stop using it.`
          }
          confirmLabel="Delete credential"
          variant="destructive"
          loading={remove.isPending}
          onConfirm={deleteConnection}
        >
          {({ openDialog: openDeleteDialog }) => (
            <ProviderDialogController
              organizationId={organizationId}
              surface="overview"
            >
              {({ openEditDialog }) => (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <GatewayProvidersTable
                    connections={allConnections}
                    modelCounts={modelCounts}
                    onSelect={selectConnection}
                    onRetry={retryConnection}
                    retryDisabled={
                      retry.isPending
                        ? { reason: "Validation in progress" }
                        : undefined
                    }
                    onEdit={openEditDialog}
                    onDelete={openDeleteDialog}
                  />
                </div>
              )}
            </ProviderDialogController>
          )}
        </ConfirmationDialogController>
      </section>
      {connectionsQuery.hasNextPage ? (
        <Button
          className="w-fit self-center"
          variant="secondary"
          loading={connectionsQuery.isFetchingNextPage}
          onClick={() => connectionsQuery.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function ProvidersSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gateway-providers-loading"
    >
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
