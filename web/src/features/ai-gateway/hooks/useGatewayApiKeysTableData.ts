import type { OrderByState } from "@langfuse/shared";
import { keepPreviousData } from "@tanstack/react-query";

import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { api } from "@/src/utils/api";

/**
 * Gateway keys for one table page, then their last-used times for exactly
 * those keys. The key list never waits for ClickHouse: the last-used query is
 * unbatched and starts once the page's key ids are known.
 */
export function useGatewayApiKeysTableData({
  organizationId,
  searchQuery,
  orderBy,
  pageIndex,
  pageSize,
}: {
  organizationId: string;
  searchQuery: string;
  orderBy: OrderByState;
  pageIndex: number;
  pageSize: number;
}) {
  const apiKeysQuery = api.aiGateway.listApiKeys.useQuery(
    {
      orgId: organizationId,
      searchQuery,
      orderBy,
      page: pageIndex,
      limit: pageSize,
    },
    { placeholderData: keepPreviousData },
  );
  const lastUsedQuery = api.aiGateway.getApiKeysLastUsed.useQuery(
    {
      orgId: organizationId,
      apiKeyIds: apiKeysQuery.data?.data.map(({ apiKey }) => apiKey.id) ?? [],
    },
    {
      enabled: apiKeysQuery.isSuccess,
      trpc: { context: { skipBatch: true } },
    },
  );

  return {
    apiKeysQuery,
    rows: joinTableCoreAndMetrics(
      apiKeysQuery.data?.data.map((row) => ({ ...row, id: row.apiKey.id })),
      lastUsedQuery.data?.apiKeys,
    ).rows,
    lastUsed: toLastUsedState(lastUsedQuery),
  };
}

function toLastUsedState({
  data,
  isError,
}: {
  data?: { isTracked: boolean };
  isError: boolean;
}) {
  if (data) return { status: "success" as const, isTracked: data.isTracked };
  if (isError) return { status: "error" as const };
  return { status: "loading" as const };
}
