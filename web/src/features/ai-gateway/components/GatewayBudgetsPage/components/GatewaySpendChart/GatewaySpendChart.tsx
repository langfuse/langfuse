import { useMemo } from "react";
import { MAX_TIME_SERIES_BREAKDOWN_VALUES } from "@langfuse/shared/query";

import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GATEWAY_COST_OVER_TIME_WIDGET } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import {
  GATEWAY_SPEND_INTERVALS,
  type GatewaySpendInterval,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendIntervals";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { toGatewaySpendFilters } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/toGatewaySpendFilters";

type GatewaySpendChartProps = {
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
  interval: GatewaySpendInterval;
  onIntervalChange: (interval: GatewaySpendInterval) => void;
  tab: GatewaySpendTab;
  /**
   * The selected table rows by key or user id; none shows the total of all
   * gateway spend, and a few are broken down one series each.
   */
  selected: { value: string; label: string }[];
  onRemoveSelected: (value: string) => void;
};

const SPEND_WIDGET = {
  ...GATEWAY_COST_OVER_TIME_WIDGET,
  name: "Spend",
  description: "Select rows below to see their spend.",
};

const filterLabels = {
  users: "Selected users",
  apiKeys: "Selected keys",
} as const satisfies Record<GatewaySpendTab, string>;

export function GatewaySpendChart({
  fetchQuery,
  timeRange,
  interval,
  onIntervalChange,
  tab,
  selected,
  onRemoveSelected,
}: GatewaySpendChartProps) {
  const { widget, filters, labels } = useMemo(() => {
    if (selected.length === 0) {
      return { widget: SPEND_WIDGET, filters: [], labels: undefined };
    }
    const filters = toGatewaySpendFilters(
      tab,
      selected.map(({ value }) => value),
    );
    // Beyond this many series the query layer refuses a breakdown, so show their total.
    if (selected.length > MAX_TIME_SERIES_BREAKDOWN_VALUES) {
      return { widget: SPEND_WIDGET, filters, labels: undefined };
    }
    const column = GATEWAY_SPEND_TABS[tab].column;
    return {
      // One series per selected key or user, named like its row.
      widget: {
        ...SPEND_WIDGET,
        id: `${SPEND_WIDGET.id}-by-${tab}`,
        dimensions: [{ field: column }],
      },
      filters,
      labels: new Map(selected.map(({ value, label }) => [value, label])),
    };
  }, [selected, tab]);

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
      filters={filters}
      granularity={interval}
      dimensionLabelMap={labels}
      filter={{
        label: filterLabels[tab],
        items: selected,
        onRemove: onRemoveSelected,
      }}
      tabs={{
        value: interval,
        options: [...GATEWAY_SPEND_INTERVALS],
        onValueChange: handleIntervalChange,
        variant: "toggle",
      }}
    />
  );
}
