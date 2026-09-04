import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayModelsView } from "@/src/features/llm-gateway/components/GatewayModelsPage/components/GatewayModelsView/GatewayModelsView";
import type { GatewayProvider } from "@/src/features/llm-gateway/types/gatewayProvider";
import { api, reportNonTrpcError, type RouterOutputs } from "@/src/utils/api";

type Connection =
  RouterOutputs["llmGateway"]["listConnections"]["data"][number];
type RefreshResult = RouterOutputs["llmGateway"]["refreshModels"][number];

const providerFormats: Record<GatewayProvider, string[]> = {
  OPENAI: ["OpenAI Responses", "OpenAI Chat Completions"],
  ANTHROPIC: ["Anthropic Messages"],
  OPENROUTER: ["OpenAI Responses", "OpenAI Chat Completions"],
};

type ModelRow = {
  id: string;
  availableVia: Array<{ connectionName: string; provider: GatewayProvider }>;
  apiFormats: string[];
};

export function GatewayModelsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const connectionsQuery = api.llmGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  const modelsQuery = api.llmGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled: connectionsQuery.isSuccess },
  );

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
    modelsQuery
      .refetch()
      .then(() => undefined)
      .catch((error) => reportNonTrpcError(error, "llm-gateway-models"));

  return (
    <GatewayModelsView
      models={rows}
      failedProviderCount={failedResults.length}
      providerCount={results?.length ?? connections.length}
      hasProviders={connections.length > 0}
      hasSynced={results !== null}
      isLoading={modelsQuery.isPending || modelsQuery.isFetching}
      syncError={modelsQuery.isError}
      onSync={sync}
      hasMoreProviders={Boolean(connectionsQuery.hasNextPage)}
      isLoadingMoreProviders={connectionsQuery.isFetchingNextPage}
      onLoadMoreProviders={() => connectionsQuery.fetchNextPage()}
    />
  );
}

function aggregateModels(
  results: RefreshResult[],
  connections: Connection[],
): ModelRow[] {
  const connectionsById = new Map(
    connections.map((connection) => [connection.id, connection]),
  );
  const models = new Map<string, ModelRow>();

  for (const result of results) {
    if (!result.success) continue;
    const connection = connectionsById.get(result.connectionId);
    if (!connection) continue;
    for (const modelId of result.models) {
      const existing = models.get(modelId);
      const availableVia = {
        connectionName: connection.name,
        provider: connection.provider,
      };
      if (existing) {
        existing.availableVia.push(availableVia);
        existing.apiFormats = [
          ...new Set([
            ...existing.apiFormats,
            ...providerFormats[connection.provider],
          ]),
        ];
      } else {
        models.set(modelId, {
          id: modelId,
          availableVia: [availableVia],
          apiFormats: [...providerFormats[connection.provider]],
        });
      }
    }
  }

  return [...models.values()].toSorted((left, right) =>
    left.id.localeCompare(right.id),
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
