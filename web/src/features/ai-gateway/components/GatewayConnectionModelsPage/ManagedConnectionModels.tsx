import type { ReactNode } from "react";
import { RefreshCw } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { ModelListingDeniedAlert } from "@/src/features/ai-gateway/components/ModelListingDeniedAlert/ModelListingDeniedAlert";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionModelsEditor } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsEditor";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";

export type ManagedConnectionModelsProps = {
  organizationId: string;
  connectionId: string;
  /** Rendered next to the search field, before the refresh action, e.g. the provider filter. */
  filter: ReactNode;
};

/** Model access for one provider credential, editable by gateway managers. */
export function ManagedConnectionModels({
  organizationId,
  connectionId,
  filter,
}: ManagedConnectionModelsProps) {
  const connectionModels = useGatewayConnectionModels({
    organizationId,
    connectionId,
  });
  const { connectionQuery, isRetrying, retryDiscovery } = connectionModels;

  const filters = (
    <div className="flex items-center gap-2">
      {filter}
      <IconButton
        icon={RefreshCw}
        label="Refresh models from provider"
        variant="outline"
        disabled={isRetrying || !connectionQuery.data}
        onClick={retryDiscovery}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ConnectionModelsContent
        organizationId={organizationId}
        connectionModels={connectionModels}
        filters={filters}
      />
    </div>
  );
}

type ConnectionModelsContentProps = {
  organizationId: string;
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
  /** Shown above the content until the table, which renders them in its toolbar, is ready. */
  filters: ReactNode;
};

function ConnectionModelsContent({
  organizationId,
  connectionModels,
  filters,
}: ConnectionModelsContentProps) {
  const { connectionQuery, modelsQuery, retryQueries } = connectionModels;
  const connection = connectionQuery.data;

  if (!connection && connectionQuery.isError) {
    return (
      <>
        {filters}
        <GatewayLoadError kind="connection" onRetry={retryQueries} />
      </>
    );
  }
  if (!connection || modelsQuery.isPending) {
    return <ConnectionModelsSkeleton filters={filters} />;
  }
  if (modelsQuery.isError || !modelsQuery.data) {
    return (
      <>
        {filters}
        <GatewayLoadError kind="models" onRetry={retryQueries} />
      </>
    );
  }
  if (!modelsQuery.data.success) {
    return (
      <>
        {filters}
        <Alert variant="destructive">
          <Alert.Title>Models could not be loaded</Alert.Title>
          <Alert.Description>
            The provider returned a model discovery error. Refresh the provider
            before changing model access.
          </Alert.Description>
        </Alert>
      </>
    );
  }

  return (
    <>
      {modelsQuery.data.modelListingDenied ? (
        <ModelListingDeniedAlert provider={connection.provider} />
      ) : null}
      <ConnectionModelsEditor
        key={`${organizationId}:${connection.id}`}
        organizationId={organizationId}
        connection={connection}
        models={modelsQuery.data.models}
        modelApiFormats={modelsQuery.data.modelApiFormats}
        connectionModels={connectionModels}
        filters={filters}
      />
    </>
  );
}
