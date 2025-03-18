import {
  transformCategoricalScoresToChartData,
  uniqueAndSort,
} from "@/src/features/dashboard/lib/score-analytics-utils";
import {
  type ChartBin,
  type ChartData,
  type TimeseriesDataTransformer,
} from "@/src/features/scores/types";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { type DashboardDateRangeAggregationOption } from "@/src/utils/date-range-utils";

export class DashboardCategoricalScoreAdapter
  implements TimeseriesDataTransformer
{
  constructor(
    private data: DatabaseRow[],
    private timestamp: string,
    private agg?: DashboardDateRangeAggregationOption,
  ) {}

  toChartData(): ChartData {
    const { chartData, chartLabels } = transformCategoricalScoresToChartData(
      this.data,
      this.timestamp,
      this.agg,
    );
    return { chartData, chartLabels: uniqueAndSort(chartLabels) };
  }
}

export class CompareViewAdapter implements TimeseriesDataTransformer {
  constructor(
    private runMetrics: Map<
      string,
      { chartData: ChartBin[]; chartLabels: string[] }
    >,
    private key: string,
  ) {}

  toChartData(): ChartData {
    return {
      chartData: this.runMetrics.get(this.key)?.chartData ?? [],
      chartLabels: uniqueAndSort(
        this.runMetrics.get(this.key)?.chartLabels ?? [],
      ),
    };
  }
}
