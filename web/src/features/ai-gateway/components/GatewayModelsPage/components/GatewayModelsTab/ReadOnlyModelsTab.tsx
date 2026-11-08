import type { ReactNode } from "react";

import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { GatewayConnectionModelsReadOnlyTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsReadOnlyTable/GatewayConnectionModelsReadOnlyTable";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { GatewayNoProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersEmptyState";
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
    return (
      <GatewayLoadError
        kind="providers"
        onRetry={() => connectionsQuery.refetch()}
      />
    );
  }

  const connections = connectionsQuery.data;
  const connection =
    connections.find(({ id }) => id === connectionId) ?? connections[0];
  if (!connection) return <GatewayNoProvidersEmptyState />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ReadOnlyConnectionModels
        filters={
          <ConnectionFilter
            connections={connections}
            value={connection.id}
            onChange={selectConnection}
          />
        }
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
  filters,
  connection,
  results,
  isPending,
  onRetry,
}: {
  /** Shown above the content until the table, which renders them in its toolbar, is ready. */
  filters: ReactNode;
  connection: ModelConnection;
  results: RouterOutputs["aiGateway"]["refreshModels"] | undefined;
  isPending: boolean;
  onRetry: () => void;
}) {
  if (isPending) {
    return (
      <>
        {filters}
        <ConnectionModelsSkeleton />
      </>
    );
  }

  const result = results?.find(
    ({ connectionId }) => connectionId === connection.id,
  );
  const allowedModels = toGatewayAllowedModelsSet(connection.allowedModels);
  // Without the catalog, an allowlist that allows everything has no rows to show.
  if (
    !result?.success ||
    (result.catalogUnavailable && allowedModels === null)
  ) {
    return (
      <>
        {filters}
        <GatewayLoadError kind="models" onRetry={onRetry} />
      </>
    );
  }

  return (
    <GatewayConnectionModelsReadOnlyTable
      filters={filters}
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
