import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { CreateProviderDialogController } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/CreateProviderDialogController/CreateProviderDialogController";
import { DeleteProviderDialog } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/DeleteProviderDialog";
import { EditProviderDialogController } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/EditProviderDialogController/EditProviderDialogController";
import { GatewayProvidersView } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/GatewayProvidersView/GatewayProvidersView";
import { ReorderProviderButton } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/ReorderProviderButton";
import { RetryProviderButton } from "@/src/features/llm-gateway/components/GatewayProvidersPage/components/RetryProviderButton";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function GatewayProvidersPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const connectionsQuery = api.llmGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({});
  const utils = api.useUtils();
  const reorder = api.llmGateway.reorderConnections.useMutation();

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
        if (sourceIndex < 0 || targetIndex < 0) return;
        const connectionIds = connections.map((connection) => connection.id);
        const [movedId] = connectionIds.splice(sourceIndex, 1);
        if (!movedId) return;
        connectionIds.splice(targetIndex, 0, movedId);
        try {
          await reorder.mutateAsync({ orgId: organizationId, connectionIds });
          await utils.llmGateway.listConnections.invalidate({
            orgId: organizationId,
          });
        } catch (error) {
          reportNonTrpcError(error, "llm-gateway-providers");
        }
      }}
      createAction={
        <CreateProviderDialogController organizationId={organizationId}>
          {({ Trigger }) => (
            <Trigger asChild>
              <Button>
                <Plus className="mr-1.5 size-4" />
                Add credential
              </Button>
            </Trigger>
          )}
        </CreateProviderDialogController>
      }
      renderPriorityActions={(_connection, index) => (
        <>
          <ReorderProviderButton
            organizationId={organizationId}
            connections={connections}
            index={index}
            direction="up"
            canReorder={!connectionsQuery.hasNextPage}
          />
          <ReorderProviderButton
            organizationId={organizationId}
            connections={connections}
            index={index}
            direction="down"
            canReorder={!connectionsQuery.hasNextPage}
          />
        </>
      )}
      renderCredentialActions={(_connection, index) => {
        const connection = connections[index];
        if (!connection) return null;
        return (
          <>
            <RetryProviderButton
              organizationId={organizationId}
              connectionId={connection.id}
              onModelsLoaded={(count) =>
                setModelCounts((current) => ({
                  ...current,
                  [connection.id]: count,
                }))
              }
            />
            <EditProviderDialogController
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
            </EditProviderDialogController>
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
