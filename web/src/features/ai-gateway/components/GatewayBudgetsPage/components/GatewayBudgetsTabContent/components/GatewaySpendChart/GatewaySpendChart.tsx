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
import type { GatewaySpendSelection } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewaySpendSelection";

type GatewaySpendChartProps = {
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
  interval: GatewaySpendInterval;
  onIntervalChange: (interval: GatewaySpendInterval) => void;
  tab: GatewaySpendTab;
  /** A few selected keys or users are broken down one series each. */
  selection: GatewaySpendSelection;
  /** What the filter shows: the selected rows, or one tag for all matching ones. */
  tags: { value: string; label: string }[];
  onRemoveTag: (value: string) => void;
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
  selection,
  tags,
  onRemoveTag,
}: GatewaySpendChartProps) {
  const { widget, filters, labels } = useMemo(() => {
    if (selection.status === "none") {
      return { widget: SPEND_WIDGET, filters: [], labels: undefined };
    }
    const subjects = selection.status === "selected" ? selection.subjects : [];
    const filters = toGatewaySpendFilters(
      tab,
      subjects.map(({ value }) => value),
    );
    // Beyond this many series the query layer refuses a breakdown, so show their total.
    if (
      subjects.length === 0 ||
      subjects.length > MAX_TIME_SERIES_BREAKDOWN_VALUES
    ) {
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
      labels: new Map(subjects.map(({ value, label }) => [value, label])),
    };
  }, [selection, tab]);

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
      isWaitingForLabels={selection.status === "loading"}
      displayError={
        selection.status === "error"
          ? {
              message: "The selected keys or users could not be loaded.",
              onRetry: selection.onRetry,
            }
          : undefined
      }
      filter={{
        label: filterLabels[tab],
        items: tags,
        onRemove: onRemoveTag,
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
