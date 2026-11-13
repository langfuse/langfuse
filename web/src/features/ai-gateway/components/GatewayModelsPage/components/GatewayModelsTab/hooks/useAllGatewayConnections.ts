import { useEffect, useEffectEvent } from "react";

import { useGatewayConnections } from "@/src/features/ai-gateway/hooks/useGatewayConnections";

/**
 * Every provider credential of the organization, for the credential picker.
 * Fetches the remaining pages on its own; `connections` stays undefined until all are loaded.
 */
export function useAllGatewayConnections(organizationId: string) {
  const {
    connections,
    hasMoreConnections,
    isLoadingMoreConnections,
    loadMoreConnections,
    isError,
    refetch,
  } = useGatewayConnections(organizationId);
  const shouldLoadMore =
    hasMoreConnections && !isLoadingMoreConnections && !isError;

  const loadNextPage = useEffectEvent(() => loadMoreConnections());

  useEffect(() => {
    if (shouldLoadMore) loadNextPage();
  }, [shouldLoadMore]);

  return {
    connections: hasMoreConnections ? undefined : connections,
    isError,
    refetch,
  };
}
