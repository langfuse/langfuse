import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type AggregationFn } from "@/src/features/chart-view/types";
import { getScoreMetric } from "@/src/features/scores-chart-view/fns/scoreChartConfig";
import {
  type ScoreChartDataset,
  type ScoreMetricKey,
} from "@/src/features/scores-chart-view/types";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.chartView");
  const labelsT = useTranslations("systemUi.chartControls");
  const options = getScoreMetric(metric, dataset).aggregations;
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as AggregationFn)}
      disabled={options.length <= 1}
    >
      <SelectTrigger className={TRIGGER_CLASS} aria-label={t("aggregation")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((agg) => (
          <SelectItem key={agg} value={agg}>
            {labelsT(`aggregations.${agg}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
