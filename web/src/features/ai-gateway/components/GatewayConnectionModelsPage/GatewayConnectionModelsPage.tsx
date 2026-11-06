import { useMemo } from "react";
import { ArrowLeft } from "@langfuse/icons";

import { ModelListingDeniedAlert } from "@/src/features/ai-gateway/components/ModelListingDeniedAlert/ModelListingDeniedAlert";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { isGatewayPreReleaseEnvironment } from "@/src/features/ai-gateway/fns/isGatewayPreReleaseEnvironment";
import { AddCustomModelDialogController } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/AddCustomModelDialogController/AddCustomModelDialogController";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionSummary } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionSummary/ConnectionSummary";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { useGatewayModelAccess } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayModelAccess";
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
  const connectionModels = useGatewayConnectionModels({
    organizationId,
    connectionId,
  });
  const { connectionQuery, isRetrying, retryDiscovery, retryQueries } =
    connectionModels;
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
          organizationId={organizationId}
          connection={connection}
          connectionModels={connectionModels}
          onRetry={retryQueries}
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
      path={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway`}
      value="Gateway setup"
      icon={ArrowLeft}
    />
  );
}

type ConnectionModelsBodyProps = {
  organizationId: string;
  connection: GatewayConnection | undefined;
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
  onRetry: () => void;
};

function ConnectionModelsBody({
  organizationId,
  connection,
  connectionModels,
  onRetry,
}: ConnectionModelsBodyProps) {
  const { modelsQuery } = connectionModels;
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

type ConnectionModelsEditorProps = {
  organizationId: string;
  connection: GatewayConnection;
  models: string[];
  connectionModels: ReturnType<typeof useGatewayConnectionModels>;
};

/**
 * Mounted once the connection and its models are loaded, which seeds the
 * toggle store. Keyed by connection so another connection gets a fresh store.
 */
function ConnectionModelsEditor({
  organizationId,
  connection,
  models,
  connectionModels,
}: ConnectionModelsEditorProps) {
  const {
    isSaving,
    isAddingCustomModel,
    isTestingModel,
    addCustomModel,
    testModel,
    removeCustomModel,
    setModelsEnabled,
  } = connectionModels;
  const modelAccess = useGatewayModelAccess({
    organizationId,
    connectionId: connection.id,
    allowedModels: connection.allowedModels,
  });
  const toolbarActions = useMemo(
    () =>
      isGatewayPreReleaseEnvironment() ? (
        <AddCustomModelDialogController
          existingModels={models}
          isAdding={isAddingCustomModel}
          isTesting={isTestingModel}
          onAdd={addCustomModel}
          onTest={testModel}
        >
          {({ openDialog }) => (
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={openDialog}
            >
              Add custom model
            </Button>
          )}
        </AddCustomModelDialogController>
      ) : undefined,
    [
      models,
      isAddingCustomModel,
      isTestingModel,
      addCustomModel,
      testModel,
      isSaving,
    ],
  );

  return (
    <GatewayConnectionModelsTable
      provider={connection.provider}
      models={models}
      customModels={connection.customModels}
      modelAccessStore={modelAccess.store}
      isSaving={isSaving}
      toolbarActions={toolbarActions}
      onToggleModel={modelAccess.toggleModel}
      onRemoveCustomModel={removeCustomModel}
      onSetModelsEnabled={setModelsEnabled}
    />
  );
}
