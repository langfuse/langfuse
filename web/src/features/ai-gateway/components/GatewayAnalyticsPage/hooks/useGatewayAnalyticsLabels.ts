import { useMemo } from "react";

import { toLabelMap } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/toLabelMap";
import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { api } from "@/src/utils/api";

/** Label maps per source; empty until loaded, so charts fall back to raw IDs. */
export function useGatewayAnalyticsLabels(
  organizationId: string,
): Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>> {
  const { data } = api.aiGateway.getAnalyticsLabels.useQuery({
    orgId: organizationId,
  });

  return useMemo(
    () => ({
      apiKeys: toLabelMap(data?.apiKeys ?? []),
      users: toLabelMap(data?.users ?? []),
    }),
    [data],
  );
}
