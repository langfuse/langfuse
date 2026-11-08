import { Button as TextButton } from "@/src/components/design-system/Button/Button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Button } from "@/src/components/ui/button";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { getGatewayModelCounts } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/getGatewayModelCounts";
import { GatewayNoProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersEmptyState";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { AddProviderCard } from "./components/AddProviderCard/AddProviderCard";
import { GatewayProviderCard } from "./components/GatewayProviderCard/GatewayProviderCard";
import { GatewayProviderCardGrid } from "./components/GatewayProviderCardGrid";
import { ManagedProviderCardActions } from "./components/ManagedProviderCardActions";
import { ProvidersTabSkeleton } from "./components/ProvidersTabSkeleton";

export type ManagedProvidersTabProps = {
  organizationId: string;
};

/** Provider credentials with edit, validation and delete controls. */
export function ManagedProvidersTab({
  organizationId,
}: ManagedProvidersTabProps) {
  const connectionsQuery = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: gatewayConnectionsPageSize },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: connectionsQuery.isSuccess },
  );
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const retry = api.aiGateway.retryConnection.useMutation();
  const remove = api.aiGateway.deleteConnection.useMutation();

  const invalidateConnections = () =>
    Promise.all([
      utils.aiGateway.listConnections.invalidate({ orgId: organizationId }),
      utils.aiGateway.refreshModels.invalidate({ orgId: organizationId }),
    ]);

  const retryConnection = async (connection: GatewayConnection) => {
    try {
      await retry.mutateAsync({ orgId: organizationId, id: connection.id });
      await invalidateConnections();
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

  const deleteConnection = async (connection: GatewayConnection) => {
    try {
      await remove.mutateAsync({ orgId: organizationId, id: connection.id });
      capture("ai_gateway:provider_credential_deleted", {
        orgId: organizationId,
        provider: connection.provider,
      });
      await invalidateConnections();
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
      throw error;
    }
  };

  if (connectionsQuery.isPending) return <ProvidersTabSkeleton />;
  if (connectionsQuery.isError) {
    return (
      <GatewayLoadError
        kind="providers"
        onRetry={() => connectionsQuery.refetch()}
      />
    );
  }

  const connections = connectionsQuery.data.pages.flatMap((page) => page.data);
  const modelCounts = getGatewayModelCounts(
    modelsQuery.data ?? [],
    connections,
  );

  return (
    <ProviderDialogController
      organizationId={organizationId}
      surface="overview"
    >
      {({ openAddDialog, openEditDialog }) => (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {GATEWAY_SETUP.description}{" "}
            <TextButton
              variant="text"
              text="How to set up the gateway"
              href={GATEWAY_SETUP.docsUrl}
            />
          </p>
          {connections.length === 0 ? (
            <GatewayNoProvidersEmptyState onAddProvider={openAddDialog} />
          ) : (
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
                <GatewayProviderCardGrid>
                  {connections.map((connection) => (
                    <GatewayProviderCard
                      key={connection.id}
                      name={connection.name}
                      provider={connection.provider}
                      status={connection.status}
                      credential={connection.displaySecret}
                      modelCount={
                        modelsQuery.isPending
                          ? "loading"
                          : modelCounts[connection.id]
                      }
                      modelsHref={buildGatewayModelsUrl(
                        organizationId,
                        connection.id,
                      )}
                      actions={
                        <ManagedProviderCardActions
                          connection={connection}
                          isRetrying={retry.isPending}
                          onEdit={openEditDialog}
                          onRetry={retryConnection}
                          onDelete={openDeleteDialog}
                        />
                      }
                    />
                  ))}
                  <AddProviderCard onAdd={openAddDialog} />
                </GatewayProviderCardGrid>
              )}
            </ConfirmationDialogController>
          )}
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
      )}
    </ProviderDialogController>
  );
}
