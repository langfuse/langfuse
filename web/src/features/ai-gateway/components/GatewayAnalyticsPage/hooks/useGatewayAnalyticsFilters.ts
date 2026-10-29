import { useMemo, useState } from "react";
import { type FilterState } from "@langfuse/shared";

import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useEnvironmentFilterOptionsCache } from "@/src/hooks/use-environment-filter-options-cache";
import {
  convertSelectedEnvironmentsToFilter,
  useEnvironmentFilter,
} from "@/src/hooks/useEnvironmentFilter";
import { type TimeRange } from "@/src/utils/date-range-utils";

/**
 * Environment selection plus the user and API key filter builder, as on
 * dashboards. Filter values are IDs; options show member and API key names.
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
  const [builderFilters, setBuilderFilters] = useState<FilterState>([]);

  const { environmentOptions, isReady } = useEnvironmentFilterOptionsCache({
    projectId,
    timeRange,
  });
  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);
  const setSelectedEnvironmentsDebounced = useDebounce(setSelectedEnvironments);

  const filters = useMemo(
    () => [
      ...builderFilters,
      ...convertSelectedEnvironmentsToFilter(
        ["environment"],
        selectedEnvironments,
      ),
    ],
    [builderFilters, selectedEnvironments],
  );

  const filterColumns = useMemo(
    () => [
      {
        name: "User",
        id: "aiGatewayKeyOwnerUserId",
        type: "stringOptions" as const,
        options: toOptions(labels.users),
        internal: "aiGatewayKeyOwnerUserId",
      },
      {
        name: "API Key",
        id: "aiGatewayKeyId",
        type: "stringOptions" as const,
        options: toOptions(labels.apiKeys),
        internal: "aiGatewayKeyId",
      },
    ],
    [labels],
  );

  return {
    filters,
    isReady,
    environment: {
      values: selectedEnvironments,
      options: environmentOptions.map((value) => ({ value })),
      onValueChange: setSelectedEnvironmentsDebounced,
    },
    builder: {
      columns: filterColumns,
      filterState: builderFilters,
      onChange: setBuilderFilters,
    },
  };
}

function toOptions(labelMap: ReadonlyMap<string, string>) {
  return [...labelMap].map(([value, displayValue]) => ({
    value,
    displayValue,
  }));
}
