import { ArrowLeft } from "lucide-react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";

export type GatewayConnectionModelsPageProps = {
  organizationId: string;
  connectionId: string;
};

export function GatewayConnectionModelsPage({
  organizationId,
  connectionId,
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

  if (connectionQuery.isPending || modelsQuery.isPending) {
    return <ConnectionModelsSkeleton />;
  }
  if (connectionQuery.isError || modelsQuery.isError) {
    return (
      <ConnectionModelsLoadError
        organizationId={organizationId}
        retry={retryQueries}
      />
    );
  }

  const connection = connectionQuery.data;
  const result = modelsQuery.data;
  const models = result.success ? result.models : [];
  const allowedModelsSet = toGatewayAllowedModelsSet(connection.allowedModels);
  const enabledCount = models.filter((model) =>
    isGatewayModelAllowed(allowedModelsSet, model),
  ).length;

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
  const enableAll = () => saveAllowedModels(null);
  const disableAll = () => saveAllowedModels([]);

  return (
    <div className="flex flex-col gap-4">
      <TextLink
        path={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers`}
        value="Provider credentials"
        icon={ArrowLeft}
      />
      <div>
        <h2 className="text-lg font-bold">{connection.name}</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Only enabled models can be requested through this credential.{" "}
          {enabledCount} of {models.length} enabled.
        </p>
      </div>
      {result.success ? (
        <GatewayConnectionModelsTable
          models={models}
          allowedModels={connection.allowedModels}
          isSaving={isSaving}
          onEnableAll={enableAll}
          onDisableAll={disableAll}
          onSetEnabled={setModelsEnabled}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Alert variant="destructive">
            <Alert.Title>Models could not be loaded</Alert.Title>
            <Alert.Description>
              The provider returned a model discovery error. Retry the
              connection before changing model access.
            </Alert.Description>
          </Alert>
          <div>
            <Button
              text="Retry"
              variant="secondary"
              loading={isRetrying}
              onClick={retryDiscovery}
            />
          </div>
        </div>
      )}
    </div>
  );
}
