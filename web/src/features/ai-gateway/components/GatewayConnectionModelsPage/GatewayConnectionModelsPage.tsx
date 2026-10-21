import { ArrowLeft, RefreshCw, Trash2 } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { GatewayProviderMark } from "@/src/features/ai-gateway/components/GatewayProviderMark";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton/ConnectionModelsSkeleton";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable/GatewayConnectionModelsTable";
import { useGatewayConnectionModels } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/hooks/useGatewayConnectionModels";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { describeGatewayModelAccess } from "@/src/features/ai-gateway/fns/describeGatewayModelAccess";
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

type ConnectionSummaryProps = {
  connection: GatewayConnection | undefined;
  isDeleting: boolean;
  isError: boolean;
  isRetrying: boolean;
  onDelete: (connection: GatewayConnection) => Promise<void>;
  onRefresh: () => void;
  onRetry: () => void;
};

function ConnectionSummary({
  connection,
  isDeleting,
  isError,
  isRetrying,
  onDelete,
  onRefresh,
  onRetry,
}: ConnectionSummaryProps) {
  if (!connection) {
    if (isError) {
      return <ConnectionModelsLoadError kind="connection" retry={onRetry} />;
    }
    return (
      <>
        <ConnectionDetailsSkeleton />
        <span className="sr-only">Loading provider credential</span>
      </>
    );
  }

  const access = describeGatewayModelAccess(
    connection.allowedModels,
    connection.provider,
  );
  const deleteConnection = () => onDelete(connection);

  return (
    <>
      <ConfirmationDialogController
        title="Delete provider credential"
        text={`Delete “${connection.name}”? Requests will immediately stop using it.`}
        confirmLabel="Delete credential"
        variant="destructive"
        loading={isDeleting}
        onConfirm={deleteConnection}
      >
        {({ openDialog }) => (
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <GatewayProviderMark provider={connection.provider} />
              <h2
                className="truncate text-lg font-bold"
                title={connection.name}
              >
                {connection.name}
                <span className="sr-only">
                  {" "}
                  ({providerLabels[connection.provider]})
                </span>
              </h2>
            </div>
            <div className="flex shrink-0 -translate-y-px items-center gap-2">
              <IconButton
                icon={RefreshCw}
                label="Refresh provider models"
                variant="outline"
                disabled={isRetrying || isDeleting}
                onClick={onRefresh}
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
        )}
      </ConfirmationDialogController>
      <p className="text-muted-foreground text-sm">{access}</p>
    </>
  );
}

function ConnectionDetailsSkeleton() {
  return (
    <SkeletonGroup className="flex flex-col gap-3">
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-10 w-full max-w-2xl" />
    </SkeletonGroup>
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
