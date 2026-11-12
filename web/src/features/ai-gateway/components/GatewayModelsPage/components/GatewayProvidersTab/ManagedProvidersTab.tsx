import { Button as TextButton } from "@/src/components/design-system/Button/Button";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Button } from "@/src/components/ui/button";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { getGatewayModelCounts } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/getGatewayModelCounts";
import { GatewayNoProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersEmptyState";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import { useGatewayConnections } from "@/src/features/ai-gateway/hooks/useGatewayConnections";
import { useGatewayModelCatalog } from "@/src/features/ai-gateway/hooks/useGatewayModelCatalog";
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
  const {
    connections,
    hasMoreConnections,
    isLoadingMoreConnections,
    loadMoreConnections,
    isError,
    refetch,
  } = useGatewayConnections(organizationId);
  const catalog = useGatewayModelCatalog(organizationId, {
    enabled: connections !== undefined,
  });
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

  if (isError) return <GatewayLoadError kind="providers" onRetry={refetch} />;
  if (!connections) return <ProvidersTabSkeleton />;

  const modelCounts = getGatewayModelCounts(catalog.results ?? [], connections);
  const getModelCount = (connectionId: string) =>
    catalog.isPending ? "loading" : modelCounts[connectionId];

  return (
    <ProviderDialogController
      organizationId={organizationId}
      surface="overview"
    >
      {({ openAddDialog, openAddDialogFor, openEditDialog }) => {
        if (connections.length === 0) {
          return (
            <GatewayNoProvidersEmptyState
              onAddProvider={openAddDialog}
              onConnectProvider={openAddDialogFor}
            />
          );
        }
        return (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {GATEWAY_SETUP.description}{" "}
              <TextButton
                variant="text"
                text="How to set up the gateway"
                href={GATEWAY_SETUP.docsUrl}
              />
            </p>
            <ConfirmationDialogController<GatewayConnection>
              title="Delete connection"
              text="Requests will immediately stop using this connection."
              confirmLabel="Delete connection"
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
                      modelCount={getModelCount(connection.id)}
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
            {hasMoreConnections && (
              <Button
                className="w-fit self-center"
                variant="secondary"
                loading={isLoadingMoreConnections}
                onClick={loadMoreConnections}
              >
                Load more
              </Button>
            )}
          </div>
        );
      }}
    </ProviderDialogController>
  );
}
