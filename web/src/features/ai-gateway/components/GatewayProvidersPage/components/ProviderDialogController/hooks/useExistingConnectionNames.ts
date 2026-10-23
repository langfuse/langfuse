import { api } from "@/src/utils/api";

/** Shares the providers page's query input, so it reads the already-loaded pages. */
export function useExistingConnectionNames(organizationId: string) {
  const connectionsQuery = api.aiGateway.listConnections.useInfiniteQuery(
    { orgId: organizationId, limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
  );
  return (
    connectionsQuery.data?.pages.flatMap((page) =>
      page.data.map((connection) => connection.name),
    ) ?? []
  );
}
