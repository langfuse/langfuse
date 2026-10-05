import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ConnectedGatewayModelsTable } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayModelsTable/ConnectedGatewayModelsTable";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { aggregateModels } from "./aggregateModels";

export function GatewayModelsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const utils = api.useUtils();
  const connectionsQuery = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  const modelsQuery = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: connectionsQuery.isSuccess },
  );
  const syncModelsMutation = api.aiGateway.syncModels.useMutation({
    onSuccess: (data) => {
      utils.aiGateway.refreshModels.setData({ orgId: organizationId }, data);
    },
  });

  if (connectionsQuery.isPending) {
    return <ModelsSkeleton />;
  }

  if (connectionsQuery.isError) {
    return <ModelsLoadError retry={() => connectionsQuery.refetch()} />;
  }

  const connections =
    connectionsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const results = modelsQuery.data ?? null;
  const rows = results ? aggregateModels(results, connections) : [];
  const failedResults = results?.filter((result) => !result.success) ?? [];

  const sync = () =>
    syncModelsMutation
      .mutateAsync({ orgId: organizationId })
      .then(() => undefined)
      .catch((error) => reportNonTrpcError(error, "ai-gateway-models"));

  return (
    <ConnectedGatewayModelsTable
      models={rows}
      failedProviderCount={failedResults.length}
      providerCount={results?.length ?? connections.length}
      hasProviders={connections.length > 0}
      hasSynced={results !== null}
      isLoading={
        modelsQuery.isPending ||
        modelsQuery.isFetching ||
        syncModelsMutation.isPending
      }
      syncError={modelsQuery.isError || syncModelsMutation.isError}
      onSync={sync}
      hasMoreProviders={Boolean(connectionsQuery.hasNextPage)}
      isLoadingMoreProviders={connectionsQuery.isFetchingNextPage}
      onLoadMoreProviders={() => connectionsQuery.fetchNextPage()}
    />
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
