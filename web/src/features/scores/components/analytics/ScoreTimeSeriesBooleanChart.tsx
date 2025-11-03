import { type IntervalConfig } from "@/src/utils/date-range-utils";

export interface BooleanTimeSeriesChartProps {
  data: Array<{
    timestamp: Date;
    avg1: number | null;
    avg2: number | null;
    count: number;
  }>;
  score1Name: string;
  score2Name?: string;
  interval: IntervalConfig;
}

/**
 * Boolean time series chart component
 * Placeholder for Phase 2 implementation
 * Will render stacked bar charts for boolean score time series
 */
export function ScoreTimeSeriesBooleanChart({
  data: _data,
  score1Name: _score1Name,
  score2Name: _score2Name,
  interval: _interval,
}: BooleanTimeSeriesChartProps) {
  return (
    <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
      <div className="max-w-md">
        <p className="font-medium">Boolean time series coming in Phase 2</p>
        <p className="mt-2">
          Time series visualization for boolean scores will be implemented in
          the next phase with stacked bar charts.
        </p>
      </div>
    </div>
  );
}
