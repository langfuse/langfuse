import type { OrderByState } from "@langfuse/shared";
import { keepPreviousData } from "@tanstack/react-query";

import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { api } from "@/src/utils/api";

/**
 * Gateway keys for one table page, then their last-used times and budget spend
 * for exactly those keys. The key list never waits for ClickHouse: both
 * follow-up queries are unbatched and start once the page's key ids are known.
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
  const apiKeyIds =
    apiKeysQuery.data?.data.map(({ apiKey }) => apiKey.id) ?? [];
  const lastUsedQuery = api.aiGateway.getApiKeysLastUsed.useQuery(
    { orgId: organizationId, apiKeyIds },
    {
      enabled: apiKeysQuery.isSuccess,
      trpc: { context: { skipBatch: true } },
    },
  );
  const budgetedApiKeyIds =
    apiKeysQuery.data?.data
      .filter(({ spendLimit }) => spendLimit !== null)
      .map(({ apiKey }) => apiKey.id) ?? [];
  const spendQuery = api.aiGateway.getApiKeysSpend.useQuery(
    { orgId: organizationId, apiKeyIds: budgetedApiKeyIds },
    {
      enabled: apiKeysQuery.isSuccess && budgetedApiKeyIds.length > 0,
      trpc: { context: { skipBatch: true } },
    },
  );

  const withLastUsed = joinTableCoreAndMetrics(
    apiKeysQuery.data?.data.map((row) => ({ ...row, id: row.apiKey.id })),
    lastUsedQuery.data?.apiKeys,
  ).rows;
  return {
    apiKeysQuery,
    rows: joinTableCoreAndMetrics(withLastUsed, spendQuery.data?.apiKeys).rows,
    lastUsed: toLastUsedState(lastUsedQuery),
    spend: toSpendState(spendQuery, budgetedApiKeyIds.length > 0),
  };
}

function toSpendState(
  { data, isError }: { data?: unknown; isError: boolean },
  isNeeded: boolean,
) {
  if (data || !isNeeded) return { status: "success" as const };
  if (isError) return { status: "error" as const };
  return { status: "loading" as const };
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
