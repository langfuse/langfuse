import { useMemo } from "react";

import { toLabelMap } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/toLabelMap";
import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { api } from "@/src/utils/api";

/** Label maps per source; empty while `isPending`, when charts would fall back to raw IDs. */
export function useGatewayAnalyticsLabels(organizationId: string): {
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
  isPending: boolean;
} {
  const { data, isPending } = api.aiGateway.getAnalyticsLabels.useQuery({
    orgId: organizationId,
  });

  const labels = useMemo(
    () => ({
      apiKeys: toLabelMap(data?.apiKeys ?? []),
      users: toLabelMap(data?.users ?? []),
    }),
    [data],
  );
  return { labels, isPending };
}
