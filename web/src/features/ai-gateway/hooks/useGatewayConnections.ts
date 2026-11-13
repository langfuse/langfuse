import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
import { api } from "@/src/utils/api";

/** Provider credentials with their masked secrets, for gateway managers. */
export function useGatewayConnections(organizationId: string) {
  const query = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: gatewayConnectionsPageSize },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );

  return {
    /** The loaded pages; undefined while loading or after an error. */
    connections: query.data?.pages.flatMap((page) => page.data),
    hasMoreConnections: query.hasNextPage,
    isLoadingMoreConnections: query.isFetchingNextPage,
    loadMoreConnections: () => query.fetchNextPage(),
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}
