import { ManagedConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/ManagedConnectionModels";
import { GatewayNoProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersEmptyState";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
import { api } from "@/src/utils/api";
import { ConnectionFilter } from "./components/ConnectionFilter/ConnectionFilter";
import { useSelectGatewayConnection } from "./hooks/useSelectGatewayConnection";

export type ManagedModelsTabProps = {
  organizationId: string;
  connectionId: string | undefined;
};

/** Editable model access for one provider credential at a time. */
export function ManagedModelsTab({
  organizationId,
  connectionId,
}: ManagedModelsTabProps) {
  const connectionsQuery = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: gatewayConnectionsPageSize },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  const selectConnection = useSelectGatewayConnection(organizationId);

  if (connectionsQuery.isPending) return <ConnectionModelsSkeleton />;
  if (connectionsQuery.isError) {
    return (
      <GatewayLoadError
        kind="providers"
        onRetry={() => connectionsQuery.refetch()}
      />
    );
  }

  const connections = connectionsQuery.data.pages.flatMap((page) => page.data);
  const selectedId = connectionId ?? connections[0]?.id;
  if (!selectedId) {
    return (
      <ProviderDialogController
        organizationId={organizationId}
        surface="models_page"
      >
        {({ openAddDialog }) => (
          <GatewayNoProvidersEmptyState onAddProvider={openAddDialog} />
        )}
      </ProviderDialogController>
    );
  }

  return (
    <ManagedConnectionModels
      key={selectedId}
      organizationId={organizationId}
      connectionId={selectedId}
      filter={
        <ConnectionFilter
          connections={connections}
          value={selectedId}
          onChange={selectConnection}
        />
      }
    />
  );
}
