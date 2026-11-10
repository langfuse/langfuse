import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";

import { GATEWAY_UNPRICED_USAGE_QUERY } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { summarizeUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/summarizeUnpricedUsage";
import { useScheduledDashboardExecuteQuery } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";

/** Usage the cost widgets count as $0 because its model has no price; undefined until loaded. */
export function useGatewayUnpricedUsage({
  fetchQuery,
  timeRange,
  filters,
  enabled,
}: {
  fetchQuery: GatewayAnalyticsFetchQuery;
  enabled: boolean;
  timeRange: { from: Date; to: Date };
  filters: FilterState;
}) {
  const query = useMemo(
    () =>
      buildGatewayAnalyticsQuery(
        GATEWAY_UNPRICED_USAGE_QUERY,
        timeRange,
        filters,
      ),
    [timeRange, filters],
  );
  const result = useScheduledDashboardExecuteQuery(
    { projectId: "", version: "v2", query },
    {
      fetchQuery,
      enabled,
      trpc: { context: { skipBatch: true } },
      queryId: `ai-gateway-analytics:${GATEWAY_UNPRICED_USAGE_QUERY.id}`,
      meta: { silentHttpCodes: [412, 422] },
    },
  );

  return useMemo(
    () => (result.data ? summarizeUnpricedUsage(result.data) : undefined),
    [result.data],
  );
}
