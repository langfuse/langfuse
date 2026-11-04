import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";

import { GatewayAnalyticsHeader } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsHeader/GatewayAnalyticsHeader";
import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GatewayUnpricedUsageAlert } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayUnpricedUsageAlert/GatewayUnpricedUsageAlert";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import {
  type GatewayAnalyticsFetchQuery,
  useGatewayAnalyticsFetchQuery,
} from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { useGatewayAnalyticsFilters } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFilters";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { useGatewayUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayUnpricedUsage";
import { MultiSelect } from "@/src/features/filters/components/MultiSelect";
import { api } from "@/src/utils/api";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

/** Members only see their own usage, so per-user tiles would show just them. */
const OWN_USAGE_WIDGETS = GATEWAY_ANALYTICS_WIDGETS.filter(
  (widget) => widget.dimensionLabels !== "users",
);

export function GatewayAnalyticsDashboard({
  organizationId,
  timeRange,
  canManageGateway,
}: {
  organizationId: string;
  timeRange: TimeRange;
  canManageGateway: boolean;
}) {
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const fetchQuery = useGatewayAnalyticsFetchQuery(organizationId);
  const { labels, isPending: labelsPending } =
    useGatewayAnalyticsLabels(organizationId);
  const { filters, user, apiKey } = useGatewayAnalyticsFilters({ labels });

  return (
    <div className="flex flex-col gap-4">
      <GatewayAnalyticsHeader
        description={
          canManageGateway
            ? undefined
            : "Cost and usage of your requests made through the AI Gateway."
        }
      >
        {/* Option labels are member and API key names. */}
        <div className="ph-no-capture flex flex-wrap items-center gap-2">
          {canManageGateway ? (
            <MultiSelect
              title="User"
              label="User"
              className="my-0 w-auto overflow-hidden"
              {...user}
            />
          ) : null}
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
          organizationId={organizationId}
          fetchQuery={fetchQuery}
          timeRange={absoluteTimeRange}
          filters={filters}
          labels={labels}
          labelsPending={labelsPending}
          canManageGateway={canManageGateway}
        />
      )}
    </div>
  );
}

function GatewayAnalyticsWidgets({
  organizationId,
  fetchQuery,
  timeRange,
  filters,
  labels,
  labelsPending,
  canManageGateway,
}: {
  organizationId: string;
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
  filters: FilterState;
  labels: ReturnType<typeof useGatewayAnalyticsLabels>["labels"];
  labelsPending: boolean;
  canManageGateway: boolean;
}) {
  // Only managers can add the missing prices, in the ingestion project.
  const unpricedUsage = useGatewayUnpricedUsage({
    fetchQuery,
    timeRange,
    filters,
    enabled: canManageGateway,
  });
  const config = api.aiGateway.getConfig.useQuery(
    { orgId: organizationId },
    { enabled: canManageGateway },
  );
  const ingestionProjectId = config.data?.config?.defaultIngestionProject?.id;

  return (
    <>
      {ingestionProjectId &&
      unpricedUsage &&
      unpricedUsage.models.length > 0 ? (
        <GatewayUnpricedUsageAlert
          projectId={ingestionProjectId}
          usage={unpricedUsage}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {(canManageGateway ? GATEWAY_ANALYTICS_WIDGETS : OWN_USAGE_WIDGETS).map(
          (widget) => (
            <GatewayAnalyticsWidgetCard
              key={widget.id}
              fetchQuery={fetchQuery}
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
          ),
        )}
      </div>
    </>
  );
}
