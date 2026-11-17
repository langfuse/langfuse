import { useMemo } from "react";

import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { GATEWAY_USER_SPEND_QUERY } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewayUserSpendQuery";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { api } from "@/src/utils/api";

const NO_FILTERS: [] = [];

export type GatewayUserSpendRow = {
  /** The user id; the table selects rows by it. */
  id: string;
  name: string;
  email: string | null;
  spendUsd: number;
};

/**
 * Key owners by spend in the time range, highest first. Service keys have no
 * owner and are left out; members without gateway management only get themselves.
 */
export function useGatewayUserSpend({
  organizationId,
  fetchQuery,
  timeRange,
}: {
  organizationId: string;
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
}): AsyncTableData<GatewayUserSpendRow[]> {
  const { labels, isPending: isLabelsPending } =
    useGatewayAnalyticsLabels(organizationId);
  const labelsQuery = api.aiGateway.getAnalyticsLabels.useQuery({
    orgId: organizationId,
  });
  const emails = useMemo(
    () =>
      new Map(
        (labelsQuery.data?.users ?? []).map((user) => [user.id, user.detail]),
      ),
    [labelsQuery.data],
  );
  const query = useMemo(
    () =>
      buildGatewayAnalyticsQuery(
        GATEWAY_USER_SPEND_QUERY,
        timeRange,
        NO_FILTERS,
      ),
    [timeRange],
  );
  const result = useScheduledDashboardExecuteQuery(
    { projectId: "", version: "v2", query },
    {
      fetchQuery,
      enabled: true,
      trpc: { context: { skipBatch: true } },
      queryId: `ai-gateway-analytics:${GATEWAY_USER_SPEND_QUERY.id}`,
      meta: { silentHttpCodes: [412, 422] },
    },
  );

  return useMemo(() => {
    if (result.isError) {
      return { status: "error", error: "Spend per user could not be loaded." };
    }
    if (!result.data || isLabelsPending) return { status: "loading" };
    return {
      status: "success",
      data: result.data.map((row) => {
        const id = String(row.aiGatewayKeyOwnerUserId);
        return {
          id,
          name: labels.users.get(id) ?? id,
          email: emails.get(id) ?? null,
          spendUsd: Number(row.sum_totalCost ?? 0),
        };
      }),
    };
  }, [result.isError, result.data, isLabelsPending, labels.users, emails]);
}
