import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";

import { GatewayAnalyticsHeader } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsHeader/GatewayAnalyticsHeader";
import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GatewayUnpricedUsageAlert } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayUnpricedUsageAlert/GatewayUnpricedUsageAlert";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsFilters } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFilters";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { useGatewayUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayUnpricedUsage";
import { MultiSelect } from "@/src/features/filters";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

export function GatewayAnalyticsDashboard({
  organizationId,
  projectId,
  timeRange,
}: {
  organizationId: string;
  projectId: string;
  timeRange: TimeRange;
}) {
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const { labels, isPending: labelsPending } =
    useGatewayAnalyticsLabels(organizationId);
  const { filters, user, apiKey } = useGatewayAnalyticsFilters({ labels });

  return (
    <div className="flex flex-col gap-4">
      <GatewayAnalyticsHeader>
        {/* Option labels are member and API key names. */}
        <div className="ph-no-capture flex flex-wrap items-center gap-2">
          <MultiSelect
            title="User"
            label="User"
            className="my-0 w-auto overflow-hidden"
            {...user}
          />
          <MultiSelect
            title="Gateway key"
            label="Gateway key"
            className="my-0 w-auto overflow-hidden"
            {...apiKey}
          />
        </div>
      </GatewayAnalyticsHeader>
      {absoluteTimeRange && (
        <GatewayAnalyticsWidgets
          projectId={projectId}
          timeRange={absoluteTimeRange}
          filters={filters}
          labels={labels}
          labelsPending={labelsPending}
        />
      )}
    </div>
  );
}

function GatewayAnalyticsWidgets({
  projectId,
  timeRange,
  filters,
  labels,
  labelsPending,
}: {
  projectId: string;
  timeRange: { from: Date; to: Date };
  filters: FilterState;
  labels: ReturnType<typeof useGatewayAnalyticsLabels>["labels"];
  labelsPending: boolean;
}) {
  const unpricedUsage = useGatewayUnpricedUsage({
    projectId,
    timeRange,
    filters,
  });

  return (
    <>
      {unpricedUsage && unpricedUsage.models.length > 0 ? (
        <GatewayUnpricedUsageAlert
          projectId={projectId}
          usage={unpricedUsage}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {GATEWAY_ANALYTICS_WIDGETS.map((widget) => (
          <GatewayAnalyticsWidgetCard
            key={widget.id}
            projectId={projectId}
            widget={widget}
            timeRange={timeRange}
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
    </>
  );
}
