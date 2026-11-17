import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";
import { X } from "@langfuse/icons";

import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GATEWAY_COST_OVER_TIME_WIDGET } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import {
  GATEWAY_SPEND_INTERVALS,
  type GatewaySpendInterval,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendIntervals";

type GatewaySpendChartProps = {
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
  interval: GatewaySpendInterval;
  onIntervalChange: (interval: GatewaySpendInterval) => void;
  /** Null shows the total of all gateway spend. */
  selection: { label: string; filters: FilterState } | null;
  onClearSelection: () => void;
};

const NO_FILTERS: FilterState = [];

export function GatewaySpendChart({
  fetchQuery,
  timeRange,
  interval,
  onIntervalChange,
  selection,
  onClearSelection,
}: GatewaySpendChartProps) {
  const selectionLabel = selection?.label;
  const widget = useMemo(
    () => ({
      ...GATEWAY_COST_OVER_TIME_WIDGET,
      name: "Spend over time",
      description:
        selectionLabel === undefined
          ? "Spend of all gateway requests. Select a row below to see its spend."
          : `Spend of ${selectionLabel}`,
    }),
    [selectionLabel],
  );

  const handleIntervalChange = (value: string) => {
    const option = GATEWAY_SPEND_INTERVALS.find(
      (candidate) => candidate.value === value,
    );
    if (option) onIntervalChange(option.value);
  };

  return (
    <GatewayAnalyticsWidgetCard
      fetchQuery={fetchQuery}
      widget={widget}
      timeRange={timeRange}
      filters={selection?.filters ?? NO_FILTERS}
      granularity={interval}
      tabs={{
        value: interval,
        options: [...GATEWAY_SPEND_INTERVALS],
        onValueChange: handleIntervalChange,
      }}
      actions={
        selection
          ? {
              buttons: [
                {
                  id: "show-total",
                  label: "Show total",
                  icon: X,
                  onClick: onClearSelection,
                },
              ],
            }
          : undefined
      }
    />
  );
}
