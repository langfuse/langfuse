import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type ScoreChartDataset } from "@/src/features/scores-chart-view/types";

const TRIGGER_CLASS = "h-7 w-auto gap-1 text-xs";

// Same wording the rest of the app already uses for these three views
// (`viewLabels` in `@/src/features/monitors/helpers/monitorLabels`,
// the scores filter groups in `@/src/features/experiments/config/
// experiment-items-filter-config`) — not fresh labels invented here.
const DATASET_OPTIONS: { key: ScoreChartDataset; label: string }[] = [
  { key: "numeric", label: "Scores (numeric)" },
  { key: "boolean", label: "Scores (boolean)" },
  { key: "categorical", label: "Scores (categorical)" },
];

/**
 * The "View" picker in the scores chart config panel — which underlying
 * scores view (`scores-numeric`, `scores-boolean`, or `scores-categorical`)
 * the chart queries.
 * Switching this changes which metrics/breakdowns are offered below it (see
 * `coerceScoreChartConfig`), since the two views expose different measures.
 */
export const DatasetSelect = React.memo(function DatasetSelect({
  value,
  onChange,
}: {
  value: ScoreChartDataset;
  onChange: (value: ScoreChartDataset) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as ScoreChartDataset)}
    >
      <SelectTrigger className={TRIGGER_CLASS} aria-label="View">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATASET_OPTIONS.map((d) => (
          <SelectItem key={d.key} value={d.key}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
