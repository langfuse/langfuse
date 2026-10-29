import { useMemo, useState } from "react";
import { type FilterState } from "@langfuse/shared";

import { TimeRangePicker } from "@/src/components/date-picker";
import Header from "@/src/components/layouts/header";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { MultiSelect, PopoverFilterBuilder } from "@/src/features/filters";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useEnvironmentFilterOptionsCache } from "@/src/hooks/use-environment-filter-options-cache";
import {
  convertSelectedEnvironmentsToFilter,
  useEnvironmentFilter,
} from "@/src/hooks/useEnvironmentFilter";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

const TIME_RANGE_PRESETS = [
  "last1Day",
  "last7Days",
  "last30Days",
  "last90Days",
  "last1Year",
] as const;

export function GatewayAnalyticsDashboard({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const [userFilters, setUserFilters] = useState<FilterState>([]);
  const labels = useGatewayAnalyticsLabels(organizationId);

  const { environmentOptions } = useEnvironmentFilterOptionsCache({
    projectId,
    timeRange,
  });
  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);
  const setSelectedEnvironmentsDebounced = useDebounce(setSelectedEnvironments);

  const filters = useMemo(
    () => [
      ...userFilters,
      ...convertSelectedEnvironmentsToFilter(
        ["environment"],
        selectedEnvironments,
      ),
    ],
    [userFilters, selectedEnvironments],
  );

  // Values are IDs; option labels are member names and API key names.
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

  return (
    <div className="flex flex-col gap-4">
      <Header
        title="Gateway analytics"
        help={{
          description:
            "Cost and usage of requests made through the AI Gateway, read from its ingestion project.",
        }}
        actionButtonsLeft={
          <div className="ph-no-capture flex items-center gap-2">
            <MultiSelect
              title="Environment"
              label="Env"
              values={selectedEnvironments}
              onValueChange={setSelectedEnvironmentsDebounced}
              options={environmentOptions.map((value) => ({ value }))}
              className="my-0 w-auto overflow-hidden"
            />
            <PopoverFilterBuilder
              columns={filterColumns}
              filterState={userFilters}
              onChange={setUserFilters}
              columnIdentifier="id"
              tableName="gateway-analytics"
              isV4
            />
          </div>
        }
      />
      <PageHeaderControlsPortal>
        <TimeRangePicker
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          timeRangePresets={TIME_RANGE_PRESETS}
          className="my-0 max-w-full overflow-x-auto"
          triggerClassName="px-2"
        />
      </PageHeaderControlsPortal>
      {absoluteTimeRange && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          {GATEWAY_ANALYTICS_WIDGETS.map((widget) => (
            <GatewayAnalyticsWidgetCard
              key={widget.id}
              projectId={projectId}
              widget={widget}
              timeRange={absoluteTimeRange}
              filters={filters}
              dimensionLabelMap={
                widget.dimensionLabels && labels[widget.dimensionLabels]
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function toOptions(labelMap: ReadonlyMap<string, string>) {
  return [...labelMap].map(([value, displayValue]) => ({
    value,
    displayValue,
  }));
}
