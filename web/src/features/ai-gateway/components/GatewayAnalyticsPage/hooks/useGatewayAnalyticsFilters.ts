import { useMemo, useState } from "react";
import type { FilterState } from "@langfuse/shared";

import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useEnvironmentFilterOptionsCache } from "@/src/hooks/use-environment-filter-options-cache";
import {
  convertSelectedEnvironmentsToFilter,
  useEnvironmentFilter,
} from "@/src/hooks/useEnvironmentFilter";
import { type TimeRange } from "@/src/utils/date-range-utils";

/**
 * Environment, user and API key selections. User and API key values are IDs;
 * their options show member and API key names.
 */
export function useGatewayAnalyticsFilters({
  projectId,
  timeRange,
  labels,
}: {
  projectId: string;
  timeRange: TimeRange;
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
}) {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([]);

  const { environmentOptions, isReady } = useEnvironmentFilterOptionsCache({
    projectId,
    timeRange,
  });
  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);
  const setSelectedEnvironmentsDebounced = useDebounce(setSelectedEnvironments);

  const filters = useMemo(
    () => [
      ...convertSelectedEnvironmentsToFilter(
        ["environment"],
        selectedEnvironments,
      ),
      ...anyOf("aiGatewayKeyOwnerUserId", userIds),
      ...anyOf("aiGatewayKeyId", apiKeyIds),
    ],
    [selectedEnvironments, userIds, apiKeyIds],
  );

  const userOptions = useMemo(() => toOptions(labels.users), [labels.users]);
  const apiKeyOptions = useMemo(
    () => toOptions(labels.apiKeys),
    [labels.apiKeys],
  );

  return {
    filters,
    isReady,
    environment: {
      values: selectedEnvironments,
      options: environmentOptions.map((value) => ({ value })),
      onValueChange: setSelectedEnvironmentsDebounced,
    },
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
