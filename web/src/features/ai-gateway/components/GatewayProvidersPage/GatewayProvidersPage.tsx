import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DeleteProviderDialog } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/DeleteProviderDialog";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/ProviderDialogController/ProviderDialogController";
import { GatewayProvidersView } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/GatewayProvidersView/GatewayProvidersView";
import { RetryProviderButton } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/RetryProviderButton";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function GatewayProvidersPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const connectionsQuery = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: connectionsQuery.isSuccess },
  );
  const [retriedModelCounts, setRetriedModelCounts] = useState<
    Record<string, number>
  >({});
  const utils = api.useUtils();
  const reorder = api.aiGateway.reorderConnections.useMutation();

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

  const connections =
    connectionsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const modelCounts: Record<string, number | "loading"> = modelsQuery.isPending
    ? Object.fromEntries(
        connections
          .filter((connection) => connection.status === "ENABLED")
          .map((connection) => [connection.id, "loading"]),
      )
    : Object.fromEntries(
        (modelsQuery.data ?? [])
          .filter((result) => result.success)
          .map((result) => [result.connectionId, result.models.length]),
      );
  Object.assign(modelCounts, retriedModelCounts);

  return (
    <GatewayProvidersView
      connections={connections}
      modelCounts={modelCounts}
      hasMore={Boolean(connectionsQuery.hasNextPage)}
      isLoadingMore={connectionsQuery.isFetchingNextPage}
      onLoadMore={() => connectionsQuery.fetchNextPage()}
      canReorder={!connectionsQuery.hasNextPage && !reorder.isPending}
      onReorder={async (sourceId, targetId) => {
        const sourceIndex = connections.findIndex(
          (connection) => connection.id === sourceId,
        );
        const targetIndex = connections.findIndex(
          (connection) => connection.id === targetId,
        );
        if (sourceIndex < 0 || targetIndex < 0) return false;
        const connectionIds = connections.map((connection) => connection.id);
        const [movedId] = connectionIds.splice(sourceIndex, 1);
        if (!movedId) return false;
        connectionIds.splice(targetIndex, 0, movedId);
        try {
          await reorder.mutateAsync({ orgId: organizationId, connectionIds });
          await utils.aiGateway.listConnections.invalidate({
            orgId: organizationId,
          });
          return true;
        } catch (error) {
          reportNonTrpcError(error, "ai-gateway-providers");
          return false;
        }
      }}
      createAction={
        <ProviderDialogController organizationId={organizationId}>
          {({ Trigger }) => (
            <Trigger asChild>
              <Button>
                <Plus className="mr-1.5 size-4" />
                Add credential
              </Button>
            </Trigger>
          )}
        </ProviderDialogController>
      }
      renderCredentialActions={(connection) => {
        return (
          <>
            <RetryProviderButton
              organizationId={organizationId}
              connectionId={connection.id}
              onModelsLoaded={(count) =>
                setRetriedModelCounts((current) => ({
                  ...current,
                  [connection.id]: count,
                }))
              }
            />
            <ProviderDialogController
              key={`${connection.id}:${connection.updatedAt.toISOString()}`}
              organizationId={organizationId}
              connection={connection}
            >
              {({ Trigger }) => (
                <Trigger asChild>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Edit credential"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </Trigger>
              )}
            </ProviderDialogController>
            <DeleteProviderDialog
              organizationId={organizationId}
              connection={connection}
            />
          </>
        );
      }}
    />
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
