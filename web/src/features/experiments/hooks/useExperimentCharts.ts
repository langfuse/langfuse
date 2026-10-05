import useLocalStorage from "@/src/components/useLocalStorage";
import { pickDefaultStripMetric } from "@/src/features/experiments/fns/pickDefaultStripMetric";
import {
  type MetricOption,
  type ScoreCoverageByLevel,
} from "@/src/features/experiments/types/charts";

export type ExperimentChartSlot = {
  id: string;
  /** Null keeps the score-first automatic default until the user chooses. */
  metricId: string | null;
  chartType: "line" | "bar";
};
const INITIAL_CHARTS: ExperimentChartSlot[] = [
  { id: "initial", metricId: null, chartType: "line" },
];

function validSlots(value: unknown): value is ExperimentChartSlot[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 4 &&
    new Set(value.map((slot) => slot?.id)).size === value.length &&
    value.every(
      (slot) =>
        slot &&
        typeof slot.id === "string" &&
        (slot.metricId === null || typeof slot.metricId === "string") &&
        (slot.chartType === "line" || slot.chartType === "bar"),
    )
  );
}

export function useExperimentCharts({
  projectId,
  availableMetricOptions,
  scoreCoverage,
}: {
  projectId: string;
  availableMetricOptions: MetricOption[];
  scoreCoverage?: ScoreCoverageByLevel;
}) {
  const [storedCharts, setCharts] = useLocalStorage<ExperimentChartSlot[]>(
    `experiment-charts-v1-${projectId}`,
    INITIAL_CHARTS,
  );
  const charts = validSlots(storedCharts) ? storedCharts : INITIAL_CHARTS;
  const defaultMetricId = pickDefaultStripMetric(
    availableMetricOptions,
    scoreCoverage,
  );
  const resolvedCharts = charts.map((chart) => ({
    ...chart,
    metricId: chart.metricId ?? defaultMetricId,
  }));
  const unusedOptions = availableMetricOptions.filter(
    (option) => !resolvedCharts.some((chart) => chart.metricId === option.id),
  );

  return {
    charts: resolvedCharts,
    canAdd: charts.length < 4 && unusedOptions.length > 0,
    addChart: () => {
      if (charts.length >= 4 || unusedOptions.length === 0) return;
      setCharts([
        ...charts,
        {
          id: crypto.randomUUID(),
          metricId:
            unusedOptions.find(
              (option) =>
                option.id ===
                pickDefaultStripMetric(unusedOptions, scoreCoverage),
            )?.id ?? unusedOptions[0].id,
          chartType: "line",
        },
      ]);
    },
    removeChart: (id: string) => {
      if (charts.length > 1)
        setCharts(charts.filter((chart) => chart.id !== id));
    },
    updateChart: (
      id: string,
      update: Partial<Pick<ExperimentChartSlot, "metricId" | "chartType">>,
    ) => {
      setCharts(
        charts.map((chart) =>
          chart.id === id ? { ...chart, ...update } : chart,
        ),
      );
    },
  };
}
