import type { ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ModelListingDeniedAlert } from "@/src/features/ai-gateway/components/ModelListingDeniedAlert/ModelListingDeniedAlert";
import { GatewayLoadError } from "@/src/features/ai-gateway/components/GatewayLoadError/GatewayLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionModelsEditor } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsEditor";
import { RefreshModelsButton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/RefreshModelsButton/RefreshModelsButton";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";

export type ManagedConnectionModelsProps = {
  organizationId: string;
  connectionId: string;
  /** Rendered next to the search field, e.g. the provider filter. */
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
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ConnectionModelsContent
        organizationId={organizationId}
        connectionModels={connectionModels}
        filter={filter}
      />
    </div>
  );
}

type ConnectionModelsContentProps = {
  organizationId: string;
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
  /** Shown on the left, with the refresh button on the right, above the content until the table renders them in its toolbar. */
  filter: ReactNode;
};

function ConnectionModelsContent({
  organizationId,
  connectionModels,
  filter,
}: ConnectionModelsContentProps) {
  const { connectionQuery, modelsQuery, retryQueries } = connectionModels;
  const connection = connectionQuery.data;
  const toolbarItems = (
    <>
      {filter}
      <div className="ml-auto">
        <RefreshModelsButton connectionModels={connectionModels} />
      </div>
    </>
  );
  const filters = <div className="flex items-center gap-2">{toolbarItems}</div>;

  if (!connection && connectionQuery.isError) {
    return (
      <>
        {filters}
        <GatewayLoadError kind="connection" onRetry={retryQueries} />
      </>
    );
  }
  if (!connection || modelsQuery.isPending) {
    return <ConnectionModelsSkeleton filters={toolbarItems} />;
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
        filters={filter}
      />
    </>
  );
}
