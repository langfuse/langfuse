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
import {
  GatewayConnectionModelsTable,
  type GatewayConnectionModelsTableProps,
} from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

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
      path={buildGatewayPagePath(organizationId)}
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
  const { isSaving, modelsQuery, saveAllowedModels } = connectionModels;
  const capture = usePostHogClientCapture();
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

  const { models, modelListingDenied } = modelsQuery.data;
  const setModelsEnabled = ({
    models: targetModels,
    enabled,
    scope,
    onSuccess,
  }: Omit<
    Parameters<GatewayConnectionModelsTableProps["onSetEnabled"]>[0],
    "scope"
  > & { scope: "single" | "selection" | "all" }) => {
    let nextAllowedModels: string[] | null = enabled ? null : [];
    if (scope !== "all") {
      nextAllowedModels = updateGatewayAllowedModels({
        allowedModels: connection.allowedModels,
        availableModels: models,
        targetModels,
        enabled,
      });
    }
    const changedModelCount = targetModels.filter(
      (model) =>
        isGatewayModelAllowed(connection.allowedModels, model) !== enabled,
    ).length;
    const nextAllowedModelsSet = toGatewayAllowedModelsSet(nextAllowedModels);
    saveAllowedModels(nextAllowedModels, () => {
      capture("ai_gateway:model_access_changed", {
        orgId: organizationId,
        provider: connection.provider,
        action: enabled ? "enable" : "disable",
        scope,
        modelCount: targetModels.length,
        changedModelCount,
        enabledModelCount: models.filter((model) =>
          isGatewayModelAllowed(nextAllowedModelsSet, model),
        ).length,
        totalModelCount: models.length,
      });
      onSuccess?.();
    });
  };
  return (
    <>
      {modelListingDenied ? <ModelListingDeniedAlert /> : null}
      <GatewayConnectionModelsTable
        models={models}
        allowedModels={connection.allowedModels}
        customModels={connection.customModels}
        isSaving={isSaving}
        toolbarActions={
          isGatewayPreReleaseEnvironment() ? (
            <AddCustomModelDialogController
              existingModels={models}
              isAdding={connectionModels.isAddingCustomModel}
              isTesting={connectionModels.isTestingModel}
              onAdd={connectionModels.addCustomModel}
              onTest={connectionModels.testModel}
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
          ) : undefined
        }
        onRemoveCustomModel={connectionModels.removeCustomModel}
        onEnableAll={() =>
          setModelsEnabled({ models, enabled: true, scope: "all" })
        }
        onDisableAll={() =>
          setModelsEnabled({ models, enabled: false, scope: "all" })
        }
        onSetEnabled={setModelsEnabled}
      />
    </>
  );
}
