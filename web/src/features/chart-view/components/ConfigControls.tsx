import React from "react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  type AggregationFn,
  type DimensionKey,
  type MetricKey,
  type TimeGranularity,
} from "../types";
import {
  AGGREGATION_LABELS,
  CHART_TYPES,
  DIMENSIONS,
  getMetric,
  GRANULARITIES,
  METRICS,
} from "../vocab";

/**
 * View-only config pickers shared by the production chart view and the
 * Storybook harness. Each is a thin controlled wrapper over a primitive —
 * `value` in, `onChange` out, no feature logic.
 */

const TRIGGER_CLASS = "h-7 w-auto gap-1 text-xs";

export const MetricSelect = React.memo(function MetricSelect({
  value,
  onChange,
}: {
  value: MetricKey;
  onChange: (value: MetricKey) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MetricKey)}>
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Metric">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {METRICS.map((m) => (
          <SelectItem key={m.key} value={m.key}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

export const AggregationSelect = React.memo(function AggregationSelect({
  metric,
  value,
  onChange,
}: {
  metric: MetricKey;
  value: AggregationFn;
  onChange: (value: AggregationFn) => void;
}) {
  const options = getMetric(metric).aggregations;
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as AggregationFn)}
      disabled={options.length <= 1}
    >
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Aggregation">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((agg) => (
          <SelectItem key={agg} value={agg}>
            {AGGREGATION_LABELS[agg]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

export const BreakdownSelect = React.memo(function BreakdownSelect({
  value,
  onChange,
}: {
  value: DimensionKey;
  onChange: (value: DimensionKey) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DimensionKey)}>
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Breakdown dimension">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DIMENSIONS.map((d) => (
          <SelectItem key={d.key} value={d.key}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

export const GranularitySelect = React.memo(function GranularitySelect({
  value,
  onChange,
  disabled,
}: {
  value: TimeGranularity;
  onChange: (value: TimeGranularity) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as TimeGranularity)}
      disabled={disabled}
    >
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Time granularity">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GRANULARITIES.map((g) => (
          <SelectItem key={g} value={g}>
            {g}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

export const ChartTypePicker = React.memo(function ChartTypePicker({
  value,
  onChange,
  layout,
}: {
  value: DashboardWidgetChartType;
  onChange: (value: DashboardWidgetChartType) => void;
  /** `full`: stretch across the host, one equal column per chart type. */
  layout?: "full";
}) {
  return (
    <Tabs
      activationMode="manual"
      value={value}
      onValueChange={(v) => onChange(v as DashboardWidgetChartType)}
    >
      <Tabs.List
        variant="inset"
        size="md"
        layout={layout}
        aria-label="Chart type"
      >
        {CHART_TYPES.map((ct) => {
          const Icon = ct.icon;
          return (
            <Tooltip key={ct.value}>
              <TooltipTrigger asChild>
                <span className="h-full min-w-0">
                  <Tabs.Trigger value={ct.value}>
                    <Icon aria-hidden="true" className="icon-base shrink-0" />
                    <span className="sr-only">{ct.label}</span>
                  </Tabs.Trigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>{ct.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
});
