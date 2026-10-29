import { useMemo, useState } from "react";
import type { FilterState } from "@langfuse/shared";

import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

/**
 * User and API key selections. Values are IDs; options show member and API
 * key names.
 */
export function useGatewayAnalyticsFilters({
  labels,
}: {
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
}) {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([]);

  const filters = useMemo(
    () => [
      ...anyOf("aiGatewayKeyOwnerUserId", userIds),
      ...anyOf("aiGatewayKeyId", apiKeyIds),
    ],
    [userIds, apiKeyIds],
  );

  const userOptions = useMemo(() => toOptions(labels.users), [labels.users]);
  const apiKeyOptions = useMemo(
    () => toOptions(labels.apiKeys),
    [labels.apiKeys],
  );

  return {
    filters,
    user: { values: userIds, options: userOptions, onValueChange: setUserIds },
    apiKey: {
      values: apiKeyIds,
      options: apiKeyOptions,
      onValueChange: setApiKeyIds,
    },
  };
}

function toOptions(labelMap: ReadonlyMap<string, string>) {
  return [...labelMap].map(([value, displayValue]) => ({
    value,
    displayValue,
  }));
}

function anyOf(column: string, values: string[]): FilterState {
  if (values.length === 0) return [];
  return [{ column, operator: "any of", value: values, type: "stringOptions" }];
}
