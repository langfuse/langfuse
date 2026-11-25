import { useMemo } from "react";

import { toLabelMap } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/toLabelMap";
import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { api } from "@/src/utils/api";

/**
 * Label maps per source; empty while `isPending`, when charts would fall back to raw IDs.
 * `hasGatewayKeys` covers the keys in the viewer's usage scope and stays undefined until the labels load.
 */
export function useGatewayAnalyticsLabels(organizationId: string): {
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
  apiKeyOwnerById: ReadonlyMap<string, string | null>;
  isPending: boolean;
  hasGatewayKeys: boolean | undefined;
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
  const apiKeyOwnerById = useMemo(
    () =>
      new Map<string, string | null>(
        (data?.apiKeys ?? []).map((key) => [key.id, key.ownerUserId]),
      ),
    [data],
  );
  return {
    labels,
    apiKeyOwnerById,
    isPending,
    hasGatewayKeys: data ? data.apiKeys.length > 0 : undefined,
  };
}
