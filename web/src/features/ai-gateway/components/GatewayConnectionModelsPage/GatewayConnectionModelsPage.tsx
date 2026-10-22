import { ArrowLeft } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionSummary } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionSummary/ConnectionSummary";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewayConnectionModelsPageProps = {
  organizationId: string;
  connectionId: string;
  isDeleting: boolean;
  onDelete: (connection: GatewayConnection) => Promise<void>;
};

export function GatewayConnectionModelsPage({
  organizationId,
  connectionId,
  isDeleting,
  onDelete,
}: GatewayConnectionModelsPageProps) {
  const {
    connectionQuery,
    modelsQuery,
    isRetrying,
    isSaving,
    retryDiscovery,
    retryQueries,
    saveAllowedModels,
  } = useGatewayConnectionModels({
    organizationId,
    connectionId,
  });
  const connection = connectionQuery.data;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ProviderCredentialsLink organizationId={organizationId} />
      <ConnectionSummary
        connection={connection}
        isDeleting={isDeleting}
        isError={connectionQuery.isError}
        isRetrying={isRetrying}
        onDelete={onDelete}
        onRefresh={retryDiscovery}
        onRetry={retryQueries}
      />
      {connection || !connectionQuery.isError ? (
        <ConnectionModelsBody
          connection={connection}
          isSaving={isSaving}
          modelsQuery={modelsQuery}
          onRetry={retryQueries}
          saveAllowedModels={saveAllowedModels}
        />
      ) : null}
    </div>
  );
}

function ProviderCredentialsLink({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <TextLink
      path={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers`}
      value="Provider credentials"
      icon={ArrowLeft}
    />
  );
}

type ConnectionModelsBodyProps = {
  connection: GatewayConnection | undefined;
  isSaving: boolean;
  modelsQuery: ReturnType<typeof useGatewayConnectionModels>["modelsQuery"];
  onRetry: () => void;
  saveAllowedModels: (
    allowedModels: string[] | null,
    onSuccess?: () => void,
  ) => void;
};

function ConnectionModelsBody({
  connection,
  isSaving,
  modelsQuery,
  onRetry,
  saveAllowedModels,
}: ConnectionModelsBodyProps) {
  if (!connection || modelsQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <span className="sr-only">Loading models</span>
        <ConnectionModelsSkeleton />
      </div>
    );
  }

  if (modelsQuery.isError || !modelsQuery.data) {
    return <ConnectionModelsLoadError kind="models" retry={onRetry} />;
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

  const models = modelsQuery.data.models;
  const enableAll = () => saveAllowedModels(null);
  const disableAll = () => saveAllowedModels([]);
  const setModelsEnabled = (
    targetModels: string[],
    enabled: boolean,
    onSuccess?: () => void,
  ) => {
    saveAllowedModels(
      updateGatewayAllowedModels({
        allowedModels: connection.allowedModels,
        availableModels: models,
        targetModels,
        enabled,
      }),
      onSuccess,
    );
  };

  return (
    <GatewayConnectionModelsTable
      models={models}
      allowedModels={connection.allowedModels}
      isSaving={isSaving}
      onEnableAll={enableAll}
      onDisableAll={disableAll}
      onSetEnabled={setModelsEnabled}
    />
  );
}
