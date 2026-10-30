import { useMemo, useState } from "react";

import { TimeRangePicker } from "@/src/components/date-picker";
import Header from "@/src/components/layouts/header";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsFilters } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFilters";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { MultiSelect } from "@/src/features/filters";
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
  const labels = useGatewayAnalyticsLabels(organizationId);
  const { filters, user, apiKey } = useGatewayAnalyticsFilters({ labels });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Header
          title="Gateway analytics"
          className="mb-0!"
          help={{
            description:
              "Cost and usage of requests made through the AI Gateway, read from its ingestion project.",
          }}
        />
        {/* Option labels are member and API key names. */}
        <div className="ph-no-capture flex flex-wrap items-center gap-2">
          <MultiSelect
            title="User"
            label="User"
            className="my-0 w-auto overflow-hidden"
            {...user}
          />
          <MultiSelect
            title="API key"
            label="API key"
            className="my-0 w-auto overflow-hidden"
            {...apiKey}
          />
        </div>
      </div>
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
