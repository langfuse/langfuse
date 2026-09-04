import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { getScoreMetricsForDataset } from "@/src/features/scores-chart-view/constants/scoreMetrics";
import {
  type ScoreChartDataset,
  type ScoreMetricKey,
} from "@/src/features/scores-chart-view/types";

const TRIGGER_CLASS = "h-7 w-auto gap-1 text-xs";

/**
 * The "Metric" picker in the scores chart config panel — options depend on
 * the selected `dataset` (numeric scores can be counted or averaged;
 * categorical/text scores can only be counted).
 */
export const MetricSelect = React.memo(function MetricSelect({
  dataset,
  value,
  onChange,
}: {
  dataset: ScoreChartDataset;
  value: ScoreMetricKey;
  onChange: (value: ScoreMetricKey) => void;
}) {
  const options = getScoreMetricsForDataset(dataset);
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ScoreMetricKey)}>
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Metric">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((m) => (
          <SelectItem key={m.key} value={m.key}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
