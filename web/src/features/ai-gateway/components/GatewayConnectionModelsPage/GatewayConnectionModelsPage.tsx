/* eslint-disable @typescript-eslint/no-use-before-define */
import { ArrowLeft } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { ConnectionSummary } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionSummary/ConnectionSummary";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import type { SetGatewayModelsEnabled } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/types/setGatewayModelsEnabled";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

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
          organizationId={organizationId}
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
      path={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway`}
      value="Gateway setup"
      icon={ArrowLeft}
    />
  );
}

type ConnectionModelsBodyProps = {
  organizationId: string;
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
  organizationId,
  connection,
  isSaving,
  modelsQuery,
  onRetry,
  saveAllowedModels,
}: ConnectionModelsBodyProps) {
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

  const models = modelsQuery.data.models;
  const saveModelAccess = ({
    targetModels,
    enabled,
    scope,
    nextAllowedModels,
    onSuccess,
  }: {
    targetModels: string[];
    enabled: boolean;
    scope: "single" | "selection" | "all";
    nextAllowedModels: string[] | null;
    onSuccess?: () => void;
  }) => {
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
  const enableAll = () =>
    saveModelAccess({
      targetModels: models,
      enabled: true,
      scope: "all",
      nextAllowedModels: null,
    });
  const disableAll = () =>
    saveModelAccess({
      targetModels: models,
      enabled: false,
      scope: "all",
      nextAllowedModels: [],
    });
  const setModelsEnabled: SetGatewayModelsEnabled = ({
    models: targetModels,
    enabled,
    scope,
    onSuccess,
  }) =>
    saveModelAccess({
      targetModels,
      enabled,
      scope,
      nextAllowedModels: updateGatewayAllowedModels({
        allowedModels: connection.allowedModels,
        availableModels: models,
        targetModels,
        enabled,
      }),
      onSuccess,
    });

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
