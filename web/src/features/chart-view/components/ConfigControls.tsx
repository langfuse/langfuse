import React from "react";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
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
  showLabels = false,
}: {
  value: DashboardWidgetChartType;
  onChange: (value: DashboardWidgetChartType) => void;
  showLabels?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as DashboardWidgetChartType);
      }}
      variant="outline"
      className={cn(showLabels ? "grid grid-cols-3 gap-1" : "gap-0.5")}
    >
      {CHART_TYPES.map((ct) => {
        const Icon = ct.icon;
        const item = (
          <ToggleGroupItem
            key={ct.value}
            value={ct.value}
            size={showLabels ? "default" : "xs"}
            aria-label={ct.label}
            className={cn(
              showLabels
                ? "flex h-auto flex-col gap-1 py-2 text-[11px]"
                : "h-7 w-7 p-0",
            )}
          >
            <Icon className={showLabels ? "h-4 w-4" : "h-3.5 w-3.5"} />
            {showLabels ? <span>{ct.label}</span> : null}
          </ToggleGroupItem>
        );

        if (showLabels) return item;
        return (
          <Tooltip key={ct.value}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{ct.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
});
