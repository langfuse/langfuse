import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ConnectionModelsLoadError } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsLoadError";
import { ConnectionModelsSkeleton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ConnectionModelsSkeleton";
import { GatewayConnectionModelsTable } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsTable";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function GatewayConnectionModelsPage({
  organizationId,
  connectionId,
}: {
  organizationId: string;
  connectionId: string;
}) {
  const utils = api.useUtils();
  const connectionQuery = api.aiGateway.getConnection.useQuery({
    orgId: organizationId,
    id: connectionId,
  });
  const modelsQuery = api.aiGateway.getConnectionModels.useQuery({
    orgId: organizationId,
    id: connectionId,
  });
  const updateModels = api.aiGateway.updateConnectionModels.useMutation({
    onSuccess: async (connection) => {
      utils.aiGateway.getConnection.setData(
        { orgId: organizationId, id: connectionId },
        connection,
      );
      await Promise.all([
        utils.aiGateway.listConnections.invalidate({ orgId: organizationId }),
        utils.aiGateway.refreshModels.invalidate({ orgId: organizationId }),
      ]);
    },
    onError: (error) =>
      reportNonTrpcError(error, "ai-gateway-connection-models"),
  });

  if (connectionQuery.isPending || modelsQuery.isPending) {
    return <ConnectionModelsSkeleton />;
  }
  if (connectionQuery.isError || modelsQuery.isError) {
    return (
      <ConnectionModelsLoadError
        organizationId={organizationId}
        retry={() =>
          Promise.all([connectionQuery.refetch(), modelsQuery.refetch()])
        }
      />
    );
  }

  const connection = connectionQuery.data;
  const result = modelsQuery.data;
  const models = result.success ? result.models : [];
  const enabledCount = models.filter((model) =>
    isGatewayModelAllowed(connection.allowedModels, model),
  ).length;

  const saveAllowedModels = (
    allowedModels: string[] | null,
    onSuccess?: () => void,
  ) => {
    updateModels.mutate(
      {
        orgId: organizationId,
        id: connectionId,
        allowedModels,
      },
      { onSuccess },
    );
  };
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
      <Link
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        href={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers`}
      >
        <ArrowLeft className="icon-sm" />
        Provider credentials
      </Link>
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
          isSaving={updateModels.isPending}
          onEnableAll={enableAll}
          onDisableAll={disableAll}
          onSetEnabled={setModelsEnabled}
        />
      ) : (
        <Alert variant="destructive">
          <Alert.Title>Models could not be loaded</Alert.Title>
          <Alert.Description>
            The provider returned a model discovery error. Retry the connection
            before changing model access.
          </Alert.Description>
        </Alert>
      )}
    </div>
  );
}
