import type {
  ChartProps,
  DataPoint,
} from "@/src/features/widgets/chart-library/chart-props";

const TOTAL_SERIES_KEY = "flagged";

type RawGuardrailTimeSeriesPoint = {
  timeDimension: string;
  guardrailId?: string;
  count: number;
};

/**
 * Converts ClickHouse `WITH FILL` guardrail time-series rows into
 * `WidgetChartCard` `DataPoint[]` and series config.
 */
export function buildGuardrailChartData(params: {
  groupByGuardrail: boolean;
  points: readonly RawGuardrailTimeSeriesPoint[];
  labels?: ReadonlyMap<string, string>;
}): { data: DataPoint[]; config: NonNullable<ChartProps["config"]> } {
  if (!params.points.some((point) => point.count > 0)) {
    return { data: [], config: {} };
  }

  if (!params.groupByGuardrail) {
    return {
      data: params.points.map((point) => ({
        time_dimension: point.timeDimension,
        dimension: TOTAL_SERIES_KEY,
        metric: point.count,
      })),
      config: {
        [TOTAL_SERIES_KEY]: { label: "Flagged requests" },
      },
    };
  }

  const seriesIds = new Set<string>();
  const data: DataPoint[] = params.points.map((point) => {
    if (!point.guardrailId) {
      // Pure WITH FILL bucket marker keeps the time axis continuous without adding a series.
      return {
        time_dimension: point.timeDimension,
        dimension: undefined,
        metric: null,
      };
    }
    seriesIds.add(point.guardrailId);
    return {
      time_dimension: point.timeDimension,
      dimension: point.guardrailId,
      metric: point.count,
    };
  });

  const config: NonNullable<ChartProps["config"]> = Object.fromEntries(
    [...seriesIds].map((id) => [id, { label: params.labels?.get(id) ?? id }]),
  );
  return { data, config };
}
