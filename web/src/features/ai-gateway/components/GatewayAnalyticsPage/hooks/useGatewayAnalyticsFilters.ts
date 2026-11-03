import { useMemo, useState } from "react";
import type { FilterState } from "@langfuse/shared";

import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { useDebounce } from "@/src/hooks/useDebounce";

/**
 * User and API key selections. Values are IDs; options show member and API
 * key names. Deleted keys and former members have no option, so an ID can
 * also be typed in.
 */
export function useGatewayAnalyticsFilters({
  labels,
}: {
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
}) {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([]);
  const setUserIdsDebounced = useDebounce(setUserIds);
  const setApiKeyIdsDebounced = useDebounce(setApiKeyIds);

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
    user: {
      values: userIds,
      options: userOptions,
      onValueChange: setUserIdsDebounced,
      isCustomSelectEnabled: true,
    },
    apiKey: {
      values: apiKeyIds,
      options: apiKeyOptions,
      onValueChange: setApiKeyIdsDebounced,
      isCustomSelectEnabled: true,
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
