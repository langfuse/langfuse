import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/app/design-system/legacy-primitives/select";
import { AGGREGATION_LABELS } from "@/src/analytics/exploration/vocab";
import { type AggregationFn } from "@/src/analytics/exploration/types";
import { getScoreMetric } from "@/src/analytics/score-reporting/chart-view/fns/scoreChartConfig";
import {
  type ScoreChartDataset,
  type ScoreMetricKey,
} from "@/src/analytics/score-reporting/chart-view/types";

const TRIGGER_CLASS = "h-7 w-auto gap-1 text-xs";

/** The "Aggregation" picker in the scores chart config panel. */
export const AggregationSelect = React.memo(function AggregationSelect({
  dataset,
  metric,
  value,
  onChange,
}: {
  dataset: ScoreChartDataset;
  metric: ScoreMetricKey;
  value: AggregationFn;
  onChange: (value: AggregationFn) => void;
}) {
  const options = getScoreMetric(metric, dataset).aggregations;
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
