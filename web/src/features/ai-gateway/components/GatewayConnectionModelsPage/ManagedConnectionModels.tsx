import type { ReactNode } from "react";
import { RefreshCw } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { ModelListingDeniedAlert } from "@/src/features/ai-gateway/components/ModelListingDeniedAlert/ModelListingDeniedAlert";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionModelsEditor } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsEditor";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";

export type ManagedConnectionModelsProps = {
  organizationId: string;
  connectionId: string;
  /** Rendered before the refresh action, e.g. the provider filter. */
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
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
      <ConnectionModelsContent
        organizationId={organizationId}
        connectionModels={connectionModels}
      />
    </div>
  );
}

type ConnectionModelsContentProps = {
  organizationId: string;
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
};

function ConnectionModelsContent({
  organizationId,
  connectionModels,
}: ConnectionModelsContentProps) {
  const { connectionQuery, modelsQuery, retryQueries } = connectionModels;
  const connection = connectionQuery.data;

  if (!connection && connectionQuery.isError) {
    return <ConnectionModelsLoadError kind="connection" retry={retryQueries} />;
  }
  if (!connection || modelsQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <span className="sr-only">Loading models</span>
        <ConnectionModelsSkeleton />
      </div>
    );
  }
  if (modelsQuery.isError || !modelsQuery.data) {
    return <ConnectionModelsLoadError kind="models" retry={retryQueries} />;
  }
  if (!modelsQuery.data.success) {
    return (
      <Alert variant="destructive">
        <Alert.Title>Models could not be loaded</Alert.Title>
        <Alert.Description>
          The provider returned a model discovery error. Refresh the provider
          before changing model access.
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <>
      {modelsQuery.data.modelListingDenied ? <ModelListingDeniedAlert /> : null}
      <ConnectionModelsEditor
        key={`${organizationId}:${connection.id}`}
        organizationId={organizationId}
        connection={connection}
        models={modelsQuery.data.models}
        connectionModels={connectionModels}
      />
    </>
  );
}
