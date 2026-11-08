import { addHours, addYears, startOfHour } from "date-fns";

import { GATEWAY_USAGE_EXISTS_QUERY } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import { api } from "@/src/utils/api";

/**
 * Whether the viewer has gateway usage within the widest time range the dashboard
 * offers (one year), e.g. from keys that were since deleted. Undefined until loaded
 * or while disabled, and false when the check fails. The range is rounded to the hour so every caller shares one query.
 */
export function useHasGatewayUsageHistory({
  organizationId,
  enabled,
}: {
  organizationId: string;
  enabled: boolean;
}): boolean | undefined {
  const to = addHours(startOfHour(new Date()), 1);
  const query = buildGatewayAnalyticsQuery(
    GATEWAY_USAGE_EXISTS_QUERY,
    { from: addYears(to, -1), to },
    [],
  );
  const result = api.aiGateway.executeAnalyticsQuery.useQuery(
    { orgId: organizationId, query },
    { enabled, trpc: { context: { skipBatch: true } } },
  );

  if (!enabled) return undefined;
  if (result.isError) return false;
  if (!result.data) return undefined;
  return result.data.some((row) => Number(row.count_count ?? 0) > 0);
}
