import { ManagedConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/ManagedConnectionModels";
import { GatewayNoProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersEmptyState";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionFilter } from "./components/ConnectionFilter/ConnectionFilter";
import { useAllGatewayConnections } from "./hooks/useAllGatewayConnections";
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
  const { connections, isError, refetch } =
    useAllGatewayConnections(organizationId);
  const selectConnection = useSelectGatewayConnection(organizationId);

  if (isError) {
    return <GatewayLoadError kind="providers" onRetry={refetch} />;
  }
  if (!connections) return <ConnectionModelsSkeleton />;

  const selectedId = (
    connections.find(({ id }) => id === connectionId) ?? connections[0]
  )?.id;
  if (!selectedId) {
    return (
      <ProviderDialogController
        organizationId={organizationId}
        surface="models_page"
      >
        {({ openAddDialog, openAddDialogFor }) => (
          <GatewayNoProvidersEmptyState
            onAddProvider={openAddDialog}
            onConnectProvider={openAddDialogFor}
          />
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
