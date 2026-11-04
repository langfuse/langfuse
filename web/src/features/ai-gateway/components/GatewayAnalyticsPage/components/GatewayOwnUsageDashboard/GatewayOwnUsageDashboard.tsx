import { useMemo } from "react";

import { GatewayAnalyticsHeader } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsHeader/GatewayAnalyticsHeader";
import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsFilters } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFilters";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { useGatewayOwnUsageFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayOwnUsageFetchQuery";
import { MultiSelect } from "@/src/features/filters/components/MultiSelect";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

/** Every user tile would show only the caller. */
const OWN_USAGE_WIDGETS = GATEWAY_ANALYTICS_WIDGETS.filter(
  (widget) => widget.dimensionLabels !== "users",
);

/** The caller's own gateway usage, for members who cannot see everyone's. */
export function GatewayOwnUsageDashboard({
  organizationId,
  timeRange,
}: {
  organizationId: string;
  timeRange: TimeRange;
}) {
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const source = useGatewayOwnUsageFetchQuery(organizationId);
  const { labels, isPending: labelsPending } =
    useGatewayAnalyticsLabels(organizationId);
  const { filters, apiKey } = useGatewayAnalyticsFilters({ labels });

  return (
    <div className="flex flex-col gap-4">
      <GatewayAnalyticsHeader description="Cost and usage of your requests made through the AI Gateway.">
        {/* Option labels are API key names. */}
        <div className="ph-no-capture flex flex-wrap items-center gap-2">
          <MultiSelect
            title="Gateway key"
            label="Gateway key"
            className="my-0 w-auto overflow-hidden"
            {...apiKey}
          />
        </div>
      </GatewayAnalyticsHeader>
      {absoluteTimeRange && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          {OWN_USAGE_WIDGETS.map((widget) => (
            <GatewayAnalyticsWidgetCard
              key={widget.id}
              source={source}
              widget={widget}
              timeRange={absoluteTimeRange}
              filters={filters}
              dimensionLabelMap={
                widget.dimensionLabels && labels[widget.dimensionLabels]
              }
              isWaitingForLabels={
                Boolean(widget.dimensionLabels) && labelsPending
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
