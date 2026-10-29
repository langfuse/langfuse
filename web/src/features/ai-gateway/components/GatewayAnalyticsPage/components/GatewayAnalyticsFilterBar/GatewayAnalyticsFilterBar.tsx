import { useMemo } from "react";

import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import type { GatewayAnalyticsFilterState } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsFilterState";
import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

export type GatewayAnalyticsFilterBarProps = {
  filterState: GatewayAnalyticsFilterState;
  onFilterStateChange: (filterState: GatewayAnalyticsFilterState) => void;
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
};

export function GatewayAnalyticsFilterBar({
  filterState,
  onFilterStateChange,
  labels,
}: GatewayAnalyticsFilterBarProps) {
  const userOptions = useMemo(() => toOptions(labels.users), [labels.users]);
  const apiKeyOptions = useMemo(
    () => toOptions(labels.apiKeys),
    [labels.apiKeys],
  );

  function handleUserIdsChange(userIds: string[]) {
    onFilterStateChange({ ...filterState, userIds });
  }

  function handleApiKeyIdsChange(apiKeyIds: string[]) {
    onFilterStateChange({ ...filterState, apiKeyIds });
  }

  return (
    // Option labels are member names, emails and key notes.
    <div className="ph-no-capture flex gap-2">
      <div className="w-48">
        <MultiSelectInput
          aria-label="Filter by user"
          value={filterState.userIds}
          options={userOptions}
          onValueChange={handleUserIdsChange}
          placeholder="All users"
          selectedLabel={selectionLabel(
            filterState.userIds,
            labels.users,
            "users",
          )}
          searchPlaceholder="Search users"
          emptyMessage="No users"
        />
      </div>
      <div className="w-48">
        <MultiSelectInput
          aria-label="Filter by API key"
          value={filterState.apiKeyIds}
          options={apiKeyOptions}
          onValueChange={handleApiKeyIdsChange}
          placeholder="All API keys"
          selectedLabel={selectionLabel(
            filterState.apiKeyIds,
            labels.apiKeys,
            "API keys",
          )}
          searchPlaceholder="Search API keys"
          emptyMessage="No API keys"
        />
      </div>
    </div>
  );
}

function toOptions(labelMap: ReadonlyMap<string, string>) {
  return [...labelMap].map(([value, label]) => ({ value, label }));
}

function selectionLabel(
  ids: string[],
  labelMap: ReadonlyMap<string, string>,
  pluralNoun: string,
) {
  if (ids.length === 1) return labelMap.get(ids[0]) ?? ids[0];
  return `${ids.length} ${pluralNoun}`;
}
