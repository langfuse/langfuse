import type { FilterState } from "@langfuse/shared";

import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GATEWAY_COST_OVER_TIME_WIDGET } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import {
  GATEWAY_SPEND_INTERVALS,
  type GatewaySpendInterval,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendIntervals";
import { toGatewaySpendInterval } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/toGatewaySpendInterval";

const SPEND_WIDGET: GatewayAnalyticsWidget = {
  ...GATEWAY_COST_OVER_TIME_WIDGET,
  id: `${GATEWAY_COST_OVER_TIME_WIDGET.id}-organization`,
  name: "Spend",
  // The badge says what the spend covers.
  description: "",
};

const WHOLE_ORGANIZATION_BADGE = {
  text: "Whole organization",
  description: "Spend of every gateway key and user in this organization.",
};

const NO_FILTERS: FilterState = [];

type GatewayOrganizationSpendChartProps = {
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
  interval: GatewaySpendInterval;
  onIntervalChange: (interval: GatewaySpendInterval) => void;
};

/** The organization's total gateway spend over time, what its budgets cap. */
export function GatewayOrganizationSpendChart({
  fetchQuery,
  timeRange,
  interval,
  onIntervalChange,
}: GatewayOrganizationSpendChartProps) {
  const handleIntervalChange = (value: string) => {
    const option = toGatewaySpendInterval(value);
    if (option) onIntervalChange(option);
  };

  return (
    <GatewayAnalyticsWidgetCard
      fetchQuery={fetchQuery}
      widget={SPEND_WIDGET}
      timeRange={timeRange}
      filters={NO_FILTERS}
      granularity={interval}
      badge={WHOLE_ORGANIZATION_BADGE}
      tabs={{
        value: interval,
        options: [...GATEWAY_SPEND_INTERVALS],
        onValueChange: handleIntervalChange,
        variant: "toggle",
      }}
    />
  );
}
