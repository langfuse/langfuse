import { useRef, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/ProviderDialogController/ProviderDialogController";
import { ConnectedGatewayProvidersTable } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/GatewayProvidersTable/ConnectedGatewayProvidersTable";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";
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
  const [pageIndex, setPageIndex] = useState(0);
  const [editingConnection, setEditingConnection] =
    useState<GatewayConnection | null>(null);
  const [deletingConnection, setDeletingConnection] =
    useState<GatewayConnection | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const reorderLock = useRef(false);
  const utils = api.useUtils();
  const reorder = api.aiGateway.reorderConnections.useMutation();
  const retry = api.aiGateway.retryConnection.useMutation();
  const remove = api.aiGateway.deleteConnection.useMutation();

  const retryConnection = async (connection: GatewayConnection) => {
    try {
      const result = await retry.mutateAsync({
        orgId: organizationId,
        id: connection.id,
      });
      if (result.success) {
        setRetriedModelCounts((current) => ({
          ...current,
          [connection.id]: result.models.length,
        }));
      }
      await utils.aiGateway.listConnections.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

  const deleteConnection = async () => {
    if (!deletingConnection) return;
    try {
      await remove.mutateAsync({
        orgId: organizationId,
        id: deletingConnection.id,
      });
      await utils.aiGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      setDeletingConnection(null);
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

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

  const pages = connectionsQuery.data?.pages ?? [];
  const visiblePageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const allConnections = pages.flatMap((page) => page.data);
  const connections = pages[visiblePageIndex]?.data ?? [];
  const pageOffset = pages
    .slice(0, visiblePageIndex)
    .reduce((count, page) => count + page.data.length, 0);
  const modelCounts: Record<string, number | "loading"> = modelsQuery.isPending
    ? Object.fromEntries(
        allConnections
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
    <div className="flex flex-col gap-4">
      <Header
        title="Provider credentials"
        actionButtons={
          <ProviderDialogController organizationId={organizationId}>
            {({ openDialog }) => (
              <Button onClick={openDialog}>
                <Plus className="mr-1.5 size-4" />
                Add credential
              </Button>
            )}
          </ProviderDialogController>
        }
      />
      <p className="text-muted-foreground text-sm">
        Requests use the first compatible enabled credential in routing priority
        order. Credentials are validated against the provider when they are
        saved.
      </p>
      <div className="flex max-h-[60dvh] flex-col overflow-hidden">
        <ConnectedGatewayProvidersTable
          connections={connections}
          pageOffset={pageOffset}
          previousConnectionId={allConnections[pageOffset - 1]?.id}
          nextConnectionId={allConnections[pageOffset + connections.length]?.id}
          modelCounts={modelCounts}
          getModelsUrl={(connection) =>
            buildGatewayModelsUrl(organizationId, connection.id)
          }
          canReorder={!connectionsQuery.hasNextPage && !isReordering}
          onReorder={async (sourceId, targetId) => {
            if (reorderLock.current) return false;
            const sourceIndex = allConnections.findIndex(
              (connection) => connection.id === sourceId,
            );
            const targetIndex = allConnections.findIndex(
              (connection) => connection.id === targetId,
            );
            if (sourceIndex < 0 || targetIndex < 0) return false;
            reorderLock.current = true;
            setIsReordering(true);
            const connectionIds = allConnections.map(
              (connection) => connection.id,
            );
            const [movedId] = connectionIds.splice(sourceIndex, 1);
            if (!movedId) return false;
            connectionIds.splice(targetIndex, 0, movedId);
            try {
              await reorder.mutateAsync({
                orgId: organizationId,
                connectionIds,
              });
              await utils.aiGateway.listConnections.invalidate({
                orgId: organizationId,
              });
              if (
                Math.floor(sourceIndex / 50) !== Math.floor(targetIndex / 50)
              ) {
                setPageIndex(Math.floor(targetIndex / 50));
              }
              return true;
            } catch (error) {
              reportNonTrpcError(error, "ai-gateway-providers");
              return false;
            } finally {
              reorderLock.current = false;
              setIsReordering(false);
            }
          }}
          actions={(connection) => [
            {
              id: "retry",
              type: "item",
              title: "Retry provider validation",
              icon: RefreshCw,
              disabled: retry.isPending
                ? { reason: "Validation in progress" }
                : undefined,
              onClick: () => retryConnection(connection),
            },
            {
              id: "edit",
              type: "item",
              title: "Edit credential",
              icon: Pencil,
              onClick: () => setEditingConnection(connection),
            },
            {
              id: "delete",
              type: "item",
              title: "Delete credential",
              icon: Trash2,
              variant: "destructive",
              onClick: () => setDeletingConnection(connection),
            },
          ]}
        />
      </div>
      {editingConnection && (
        <ProviderDialogController
          key={`${editingConnection.id}:${editingConnection.updatedAt.toISOString()}`}
          organizationId={organizationId}
          connection={editingConnection}
          initiallyOpen
          onClose={() => setEditingConnection(null)}
        >
          {() => null}
        </ProviderDialogController>
      )}
      {deletingConnection && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletingConnection(null);
          }}
          title="Delete provider credential"
          description={`Delete “${deletingConnection.name}”? Requests will immediately stop using it.`}
          confirmLabel="Delete credential"
          loading={remove.isPending}
          onConfirm={deleteConnection}
        />
      )}
      <PaginationBar
        mode="cursor"
        state={{ pageIndex: visiblePageIndex, pageSize: 50 }}
        hasNextPage={
          visiblePageIndex < pages.length - 1 ||
          Boolean(connectionsQuery.hasNextPage)
        }
        isLoadingNextPage={connectionsQuery.isFetchingNextPage}
        onChange={async (nextState) => {
          if (nextState.pageIndex < pages.length) {
            setPageIndex(nextState.pageIndex);
            return;
          }
          if (!connectionsQuery.hasNextPage) return;
          const result = await connectionsQuery.fetchNextPage();
          if (result.data?.pages[nextState.pageIndex]) {
            setPageIndex(nextState.pageIndex);
          }
        }}
      />
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
