import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { getScoreDimensionsForDataset } from "@/src/features/scores-chart-view/constants/scoreDimensions";
import {
  type ScoreChartDataset,
  type ScoreDimensionKey,
} from "@/src/features/scores-chart-view/types";

const TRIGGER_CLASS = "h-7 w-auto gap-1 text-xs";

/**
 * The "Breakdown" picker in the scores chart config panel — options are the
 * selected `dataset`'s real view dimensions (see
 * `getScoreDimensionsForDataset`), so e.g. "String Value" only exists on the
 * categorical view because that's the only view declaring it. `isTimeSeries`
 * additionally hides `highCardinality` dimensions (id, traceId, ...) for a
 * time-series chart type — the server rejects that combination with a 422.
 */
export const BreakdownSelect = React.memo(function BreakdownSelect({
  dataset,
  isTimeSeries,
  value,
  onChange,
}: {
  dataset: ScoreChartDataset;
  isTimeSeries: boolean;
  value: ScoreDimensionKey;
  onChange: (value: ScoreDimensionKey) => void;
}) {
  const options = getScoreDimensionsForDataset(dataset, isTimeSeries);
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as ScoreDimensionKey)}
    >
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Breakdown dimension">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((d) => (
          <SelectItem key={d.key} value={d.key}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
