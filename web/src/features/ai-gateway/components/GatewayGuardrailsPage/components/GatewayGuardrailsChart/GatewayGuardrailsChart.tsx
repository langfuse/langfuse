import { useMemo } from "react";
import { MAX_TIME_SERIES_BREAKDOWN_VALUES } from "@langfuse/shared/query";

import {
  GATEWAY_TIME_SERIES_INTERVALS,
  type GatewayTimeSeriesInterval,
} from "@/src/features/ai-gateway/constants/gatewayTimeSeriesIntervals";
import { buildGuardrailChartData } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsChart/fns/buildGuardrailChartData";
import { useGatewayGuardrailSelection } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/hooks/useGatewayGuardrailSelection";
import type { useGatewayGuardrailsTableState } from "@/src/features/ai-gateway/hooks/useGatewayGuardrailsTableState";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { api } from "@/src/utils/api";

export type GatewayGuardrailsChartProps = {
  organizationId: string;
  timeRange: { from: Date; to: Date };
  interval: GatewayTimeSeriesInterval;
  onIntervalChange: (interval: GatewayTimeSeriesInterval) => void;
  table: ReturnType<typeof useGatewayGuardrailsTableState>;
};

export function GatewayGuardrailsChart({
  organizationId,
  timeRange,
  interval,
  onIntervalChange,
  table,
}: GatewayGuardrailsChartProps) {
  const { selection, tags, removeTag } = useGatewayGuardrailSelection(
    organizationId,
    table,
  );
  const selectedGuardrails =
    selection.status === "selected" ? selection.guardrails : undefined;
  const querySelection =
    selection.status === "selected" ? selection.querySelection : undefined;
  const labels = useMemo(() => {
    if (
      !selectedGuardrails ||
      selectedGuardrails.length === 0 ||
      selectedGuardrails.length > MAX_TIME_SERIES_BREAKDOWN_VALUES
    ) {
      return undefined;
    }
    return new Map(
      selectedGuardrails.map(({ value, label }) => [value, label]),
    );
  }, [selectedGuardrails]);

  const query = api.aiGateway.guardrails.getFlaggedTimeSeries.useQuery(
    {
      orgId: organizationId,
      fromTimestamp: timeRange.from,
      toTimestamp: timeRange.to,
      granularity: interval,
      selection: querySelection,
    },
    {
      enabled: selection.status === "none" || selection.status === "selected",
    },
  );

  const prepared = useMemo(() => {
    if (!query.data) return { data: [], config: {} };
    return buildGuardrailChartData({
      groupByGuardrail: query.data.groupByGuardrail,
      points: query.data.points,
      labels,
    });
  }, [query.data, labels]);

  const handleIntervalChange = (value: string) => {
    const option = GATEWAY_TIME_SERIES_INTERVALS.find(
      (candidate) => candidate.value === value,
    );
    if (option) onIntervalChange(option.value);
  };

  const handleRetryQuery = () => {
    query.refetch().catch(() => undefined);
  };

  const statusContent = (() => {
    if (selection.status === "error") {
      return {
        type: "error" as const,
        message: "The selected guardrails could not be loaded.",
        onRetry: selection.onRetry,
      };
    }
    if (query.isError) {
      return {
        type: "error" as const,
        message: query.error.message || "Flagged requests could not be loaded.",
        onRetry: handleRetryQuery,
      };
    }
    if (selection.status === "loading" || query.isPending) {
      return {
        type: "loading" as const,
        progress: { type: "spinner" as const },
      };
    }
    return undefined;
  })();

  return (
    <div className="ph-no-capture h-96 min-w-0">
      <WidgetChartCard
        title="Flagged requests"
        description="Select rows below to see their flagged requests."
        chartType="BAR_TIME_SERIES"
        data={prepared.data}
        config={prepared.config}
        content={statusContent}
        zeroBaseline
        filter={{
          label: "Selected guardrails",
          items: tags,
          onRemove: removeTag,
        }}
        tabs={{
          value: interval,
          options: [...GATEWAY_TIME_SERIES_INTERVALS],
          onValueChange: handleIntervalChange,
          variant: "toggle",
        }}
      />
    </div>
  );
}
