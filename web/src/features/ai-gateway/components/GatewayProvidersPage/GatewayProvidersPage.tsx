import { Plus } from "lucide-react";
import { useRouter } from "next/router";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayConnectionModelsPage } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/GatewayConnectionModelsPage";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/ProviderDialogController/ProviderDialogController";
import { GatewayProvidersTable } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/GatewayProvidersTable/GatewayProvidersTable";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function GatewayProvidersPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const connectionId =
    typeof router.query.connectionId === "string"
      ? router.query.connectionId
      : undefined;
  const connectionsQuery = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: 100 },
    {
      enabled: !connectionId,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: !connectionId && connectionsQuery.isSuccess },
  );
  const utils = api.useUtils();
  const retry = api.aiGateway.retryConnection.useMutation();
  const remove = api.aiGateway.deleteConnection.useMutation();

  const retryConnection = async (connection: GatewayConnection) => {
    try {
      await retry.mutateAsync({
        orgId: organizationId,
        id: connection.id,
      });
      await Promise.all([
        utils.aiGateway.listConnections.invalidate({
          orgId: organizationId,
        }),
        utils.aiGateway.refreshModels.invalidate({
          orgId: organizationId,
        }),
      ]);
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

  const deleteConnection = async (connection: GatewayConnection) => {
    try {
      await remove.mutateAsync({
        orgId: organizationId,
        id: connection.id,
      });
      await Promise.all([
        utils.aiGateway.listConnections.invalidate({
          orgId: organizationId,
        }),
        utils.aiGateway.refreshModels.invalidate({
          orgId: organizationId,
        }),
      ]);
      if (connection.id === connectionId) {
        await router.push(
          `/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers`,
        );
      }
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
      throw error;
    }
  };

  const selectConnection = (connection: GatewayConnection) =>
    router.push(buildGatewayModelsUrl(organizationId, connection.id));

  if (connectionId) {
    return (
      <GatewayConnectionModelsPage
        organizationId={organizationId}
        connectionId={connectionId}
        isDeleting={remove.isPending}
        onDelete={deleteConnection}
      />
    );
  }

  if (connectionsQuery.isPending) {
    return <ProvidersSkeleton />;
  }

  if (connectionsQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="Provider credentials" />
        <Alert variant="destructive">
          <Alert.Title>Provider credentials could not be loaded</Alert.Title>
          <Alert.Description>
            Retry to manage gateway routing credentials.
          </Alert.Description>
        </Alert>
        <Button
          className="w-fit"
          variant="secondary"
          onClick={() => connectionsQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const allConnections =
    connectionsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const connectionsById = new Map(
    allConnections.map((connection) => [connection.id, connection]),
  );
  const modelCounts: Record<
    string,
    { enabled: number; total: number } | "loading"
  > = modelsQuery.isPending
    ? Object.fromEntries(
        allConnections
          .filter((connection) => connection.status === "ENABLED")
          .map((connection) => [connection.id, "loading"]),
      )
    : Object.fromEntries(
        (modelsQuery.data ?? [])
          .filter((result) => result.success)
          .flatMap((result) => {
            const connection = connectionsById.get(result.connectionId);
            if (!connection) return [];
            const allowedModels = toGatewayAllowedModelsSet(
              connection.allowedModels,
            );
            const enabled = result.models.filter((model) =>
              isGatewayModelAllowed(allowedModels, model),
            ).length;
            return [
              [
                result.connectionId,
                { enabled, total: result.models.length },
              ] as const,
            ];
          }),
      );
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Header
        title="Provider credentials"
        actionButtons={
          <ProviderDialogController organizationId={organizationId}>
            {({ openAddDialog }) => (
              <Button onClick={openAddDialog}>
                <Plus className="icon-base mr-1.5" />
                Add credential
              </Button>
            )}
          </ProviderDialogController>
        }
      />
      <p className="text-muted-foreground text-sm">
        Model names are prefixed with their connection name. Credentials are
        validated against the provider when they are saved.
      </p>
      <ConfirmationDialogController<GatewayConnection>
        title="Delete provider credential"
        text={(connection) =>
          `Delete “${connection.name}”? Requests will immediately stop using it.`
        }
        confirmLabel="Delete credential"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={deleteConnection}
      >
        {({ openDialog: openDeleteDialog }) => (
          <ProviderDialogController organizationId={organizationId}>
            {({ openEditDialog }) => (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <GatewayProvidersTable
                  connections={allConnections}
                  modelCounts={modelCounts}
                  onSelect={selectConnection}
                  onRetry={retryConnection}
                  retryDisabled={
                    retry.isPending
                      ? { reason: "Validation in progress" }
                      : undefined
                  }
                  onEdit={openEditDialog}
                  onDelete={openDeleteDialog}
                />
              </div>
            )}
          </ProviderDialogController>
        )}
      </ConfirmationDialogController>
      {connectionsQuery.hasNextPage ? (
        <Button
          className="w-fit self-center"
          variant="secondary"
          loading={connectionsQuery.isFetchingNextPage}
          onClick={() => connectionsQuery.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function ProvidersSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gateway-providers-loading"
    >
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
