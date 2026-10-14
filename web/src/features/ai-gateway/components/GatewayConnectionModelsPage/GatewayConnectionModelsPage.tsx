import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
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
  const deleteConnection = () => onDelete(connection);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ConfirmationDialogController
        title="Delete provider credential"
        text={`Delete “${connection.name}”? Requests will immediately stop using it.`}
        confirmLabel="Delete credential"
        variant="destructive"
        loading={isDeleting}
        onConfirm={deleteConnection}
      >
        {({ openDialog }) => (
          <>
            <TextLink
              path={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers`}
              value="Provider credentials"
              icon={ArrowLeft}
            />
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold">{connection.name}</h2>
              <div className="flex -translate-y-px items-center gap-2">
                <IconButton
                  icon={RefreshCw}
                  label="Refresh provider models"
                  variant="outline"
                  disabled={isRetrying || isDeleting}
                  onClick={retryDiscovery}
                />
                <IconButton
                  icon={Trash2}
                  label="Delete provider credential"
                  variant="outlineDestructive"
                  disabled={isDeleting}
                  onClick={openDialog}
                />
              </div>
            </div>
          </>
        )}
      </ConfirmationDialogController>
      <div>
        <p className="text-muted-foreground text-sm">
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
              The provider returned a model discovery error. Refresh the
              provider before changing model access.
            </Alert.Description>
          </Alert>
        </div>
      )}
    </div>
  );
}
