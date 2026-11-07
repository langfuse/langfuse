import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { GatewayConnectionModelsReadOnlyTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsReadOnlyTable/GatewayConnectionModelsReadOnlyTable";
import { GatewayNoProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersEmptyState";
import { ProvidersLoadError } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayProvidersTab/components/ProvidersLoadError";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { api, type RouterOutputs } from "@/src/utils/api";
import { ConnectionFilter } from "./components/ConnectionFilter/ConnectionFilter";
import { useSelectGatewayConnection } from "./hooks/useSelectGatewayConnection";

export type ReadOnlyModelsTabProps = {
  organizationId: string;
  connectionId: string | undefined;
};

/** A provider's models and their enabled state, for members who cannot manage the gateway. */
export function ReadOnlyModelsTab({
  organizationId,
  connectionId,
}: ReadOnlyModelsTabProps) {
  const connectionsQuery = api.aiGateway.listModelConnections.useQuery({
    orgId: organizationId,
  });
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: connectionsQuery.isSuccess },
  );
  const selectConnection = useSelectGatewayConnection(organizationId);

  if (connectionsQuery.isPending) return <ConnectionModelsSkeleton />;
  if (connectionsQuery.isError) {
    return <ProvidersLoadError onRetry={() => connectionsQuery.refetch()} />;
  }

  const connections = connectionsQuery.data;
  const connection =
    connections.find(({ id }) => id === connectionId) ?? connections[0];
  if (!connection) return <GatewayNoProvidersEmptyState />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ConnectionFilter
        connections={connections}
        value={connection.id}
        onChange={selectConnection}
      />
      <ReadOnlyConnectionModels
        connection={connection}
        results={modelsQuery.data}
        isPending={modelsQuery.isPending}
        onRetry={() => modelsQuery.refetch()}
      />
    </div>
  );
}

type ModelConnection =
  RouterOutputs["aiGateway"]["listModelConnections"][number];

function ReadOnlyConnectionModels({
  connection,
  results,
  isPending,
  onRetry,
}: {
  connection: ModelConnection;
  results: RouterOutputs["aiGateway"]["refreshModels"] | undefined;
  isPending: boolean;
  onRetry: () => void;
}) {
  if (isPending) return <ConnectionModelsSkeleton />;

  const result = results?.find(
    ({ connectionId }) => connectionId === connection.id,
  );
  if (!result?.success) {
    return <ConnectionModelsLoadError kind="models" retry={onRetry} />;
  }

  const allowedModels = toGatewayAllowedModelsSet(connection.allowedModels);
  return (
    <GatewayConnectionModelsReadOnlyTable
      provider={connection.provider}
      models={result.models}
      enabledModels={
        new Set(
          result.models.filter((model) =>
            isGatewayModelAllowed(allowedModels, model),
          ),
        )
      }
    />
  );
}
