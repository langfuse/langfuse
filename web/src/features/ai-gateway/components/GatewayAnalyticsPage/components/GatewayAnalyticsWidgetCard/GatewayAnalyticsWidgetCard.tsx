import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";

import { GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgetSizeClasses";
import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { ConnectedWidgetChartCard } from "@/src/features/widgets/components/ConnectedWidgetChartCard";
import { cn } from "@/src/utils/tailwind";

export function GatewayAnalyticsWidgetCard({
  fetchQuery,
  widget,
  timeRange,
  filters,
  dimensionLabelMap,
  isWaitingForLabels = false,
}: {
  fetchQuery: GatewayAnalyticsFetchQuery;
  widget: GatewayAnalyticsWidget;
  timeRange: { from: Date; to: Date };
  filters: FilterState;
  dimensionLabelMap?: ReadonlyMap<string, string>;
  /** Keep the card loading while labels resolve so raw IDs never flash. */
  isWaitingForLabels?: boolean;
}) {
  const query = useMemo(
    () => buildGatewayAnalyticsQuery(widget, timeRange, filters),
    [widget, timeRange, filters],
  );

  return (
    <div
      className={cn(
        // Series labels can be member names, emails and key notes.
        "ph-no-capture min-w-0",
        GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES[widget.size],
      )}
    >
      <ConnectedWidgetChartCard
        title={widget.name}
        description={widget.description}
        isExternalLoading={isWaitingForLabels}
        fetchQuery={fetchQuery}
        query={query}
        version="v2"
        chartType={widget.chartType}
        chartConfig={widget.chartConfig}
        metrics={widget.metrics}
        dimensions={widget.dimensions}
        view={widget.view}
        schedulerId={`ai-gateway-analytics:${widget.id}`}
        layoutHint="compact"
        dimensionLabelMap={dimensionLabelMap}
        usdPrecision="cents"
      />
    </div>
  );
}
