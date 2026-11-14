import type { ReactNode } from "react";

import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { GatewayConnectionModelsReadOnlyTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsReadOnlyTable/GatewayConnectionModelsReadOnlyTable";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { GatewayNoProvidersReadOnlyEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/GatewayNoProvidersReadOnlyEmptyState";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { useGatewayModelCatalog } from "@/src/features/ai-gateway/hooks/useGatewayModelCatalog";
import { useGatewayModelConnections } from "@/src/features/ai-gateway/hooks/useGatewayModelConnections";
import { type RouterOutputs } from "@/src/utils/api";
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
  const { connections, isError, refetch } =
    useGatewayModelConnections(organizationId);
  const catalog = useGatewayModelCatalog(organizationId, {
    enabled: connections !== undefined,
  });
  const selectConnection = useSelectGatewayConnection(organizationId);

  if (isError) {
    return <GatewayLoadError kind="providers" onRetry={refetch} />;
  }
  if (!connections) return <ConnectionModelsSkeleton />;

  const connection =
    connections.find(({ id }) => id === connectionId) ?? connections[0];
  if (!connection) return <GatewayNoProvidersReadOnlyEmptyState />;

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
        results={catalog.results}
        isPending={catalog.isPending}
        onRetry={catalog.refetch}
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
  if (isPending) return <ConnectionModelsSkeleton filters={filters} />;

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
      connectionName={connection.name}
      provider={connection.provider}
      models={result.models}
      modelApiFormats={result.modelApiFormats}
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
