import type { ComponentProps } from "react";
import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { ConnectedGatewayModelsTable } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/ConnectedGatewayModelsTable/ConnectedGatewayModelsTable";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { api } from "@/src/utils/api";
import { aggregateModels } from "./fns/aggregateModels";

export function GatewayModelsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const { canManageGateway, isIngestionConfigured, isSetupStatusPending } =
    useGatewaySettingsAccess(organizationId);

  if (isSetupStatusPending) {
    return <ModelsSkeleton />;
  }
  /** Managers are redirected to Setup by the settings route. */
  if (!canManageGateway && isIngestionConfigured === false) {
    return <GatewayNotSetUpNotice title="Models" />;
  }
  return (
    <GatewayModels
      organizationId={organizationId}
      canManageGateway={canManageGateway}
    />
  );
}

function GatewayModels({
  organizationId,
  canManageGateway,
}: {
  organizationId: string;
  canManageGateway: boolean;
}) {
  const connectionsQuery = api.aiGateway.listModelConnections.useQuery({
    orgId: organizationId,
  });
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: connectionsQuery.isSuccess },
  );
  if (connectionsQuery.isPending) {
    return <ModelsSkeleton />;
  }

  if (connectionsQuery.isError) {
    return <ModelsLoadError retry={() => connectionsQuery.refetch()} />;
  }

  const connections = connectionsQuery.data ?? [];
  const results = modelsQuery.data ?? null;
  const rows = results ? aggregateModels(results, connections) : [];
  const failedResults = results?.filter((result) => !result.success) ?? [];
  const tableProps = {
    models: rows,
    organizationId,
    canManageGateway,
    failedProviderCount: failedResults.length,
    providerCount: results?.length ?? connections.length,
    hasProviders: connections.length > 0,
    hasSynced: results !== null,
    isLoading: modelsQuery.isPending || modelsQuery.isFetching,
    syncError: modelsQuery.isError,
  } satisfies ComponentProps<typeof ConnectedGatewayModelsTable>;

  /** The credential dialog reads the manager-only credential list. */
  if (!canManageGateway) {
    return <ConnectedGatewayModelsTable {...tableProps} />;
  }
  return (
    <ProviderDialogController
      organizationId={organizationId}
      surface="models_page"
    >
      {({ openAddDialog }) => (
        <ConnectedGatewayModelsTable
          {...tableProps}
          onAddProvider={openAddDialog}
        />
      )}
    </ProviderDialogController>
  );
}

function ModelsLoadError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway models" />
      <Alert variant="destructive">
        <Alert.Title>Provider credentials could not be loaded</Alert.Title>
        <Alert.Description>
          Models cannot be discovered until the credential list is available.
        </Alert.Description>
      </Alert>
      <Button className="w-fit" variant="secondary" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

function ModelsSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="gateway-models-loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
