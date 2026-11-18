import type { FilterState } from "@langfuse/shared";

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
  /** Keys or users the spend is limited to; none shows the total of all gateway spend. */
  subjectFilter: {
    label: string;
    placeholder: string;
    searchPlaceholder: string;
    emptyMessage: string;
    value: string[];
    options: { value: string; label: string }[];
    onValueChange: (value: string[]) => void;
    filters: FilterState;
  };
};

const SPEND_WIDGET = {
  ...GATEWAY_COST_OVER_TIME_WIDGET,
  name: "Spend",
  description: "Click rows below, or pick them here, to see only their spend.",
};

export function GatewaySpendChart({
  fetchQuery,
  timeRange,
  interval,
  onIntervalChange,
  subjectFilter,
}: GatewaySpendChartProps) {
  const handleIntervalChange = (value: string) => {
    const option = GATEWAY_SPEND_INTERVALS.find(
      (candidate) => candidate.value === value,
    );
    if (option) onIntervalChange(option.value);
  };

  return (
    <GatewayAnalyticsWidgetCard
      fetchQuery={fetchQuery}
      widget={SPEND_WIDGET}
      timeRange={timeRange}
      filters={subjectFilter.filters}
      granularity={interval}
      controls={[
        {
          type: "multiselect",
          id: "subjects",
          label: subjectFilter.label,
          placeholder: subjectFilter.placeholder,
          searchPlaceholder: subjectFilter.searchPlaceholder,
          emptyMessage: subjectFilter.emptyMessage,
          value: subjectFilter.value,
          options: subjectFilter.options,
          onValueChange: subjectFilter.onValueChange,
        },
      ]}
      tabs={{
        value: interval,
        options: [...GATEWAY_SPEND_INTERVALS],
        onValueChange: handleIntervalChange,
        variant: "toggle",
      }}
    />
  );
}
