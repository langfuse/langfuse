import { useMemo } from "react";

import { toLabelMap } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/toLabelMap";
import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { api } from "@/src/utils/api";

/**
 * Label maps per source; empty while `isPending`, when charts would fall back to raw IDs.
 * `apiKeyOwners` maps each gateway key to the user that owns it, or null for service-account keys.
 * `hasGatewayKeys` covers the keys in the viewer's usage scope and stays undefined until the labels load.
 */
export function useGatewayAnalyticsLabels(organizationId: string): {
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
  apiKeyOwners: ReadonlyMap<string, string | null>;
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
  const apiKeyOwners = useMemo(
    () =>
      new Map(
        (data?.apiKeys ?? []).map((apiKey) => [apiKey.id, apiKey.ownerUserId]),
      ),
    [data],
  );
  return {
    labels,
    apiKeyOwners,
    isPending,
    hasGatewayKeys: data ? data.apiKeys.length > 0 : undefined,
  };
}
