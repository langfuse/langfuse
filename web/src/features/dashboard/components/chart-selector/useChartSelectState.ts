import useSessionStorage from "@/src/components/useSessionStorage";
import { chartDefinitions } from "@/src/features/dashboard/components/chart-selector/chartDefinitions";

interface Chart {
  key: string;
  label: string;
}

type ChartArray = Chart[];

export function useChartSelectState(
  projectId: string,   // Assuming projectId is always available per ScoreAnalytics.tsx

) {
  const allDashboardCharts: ChartArray = chartDefinitions;
  const allDashboardChartKeys: string[] = allDashboardCharts.map((chart) => chart.key);

  //  Moving deconstruction of chartKeys here instead of index.tsx
  // const allDashboardChartKeys: ChartArray = chartDefinitions.map((chart) => chart.key);

  // Using similar storage naming pattern as ScoreAnalytics.tsx
  const [selectedDashboardChartKeys, setSelectedDashboardChartKeys] =
    useSessionStorage<string[]>(
      `selectedDashboardChartKeys-${projectId}`,
      allDashboardChartKeys,
    );

  // Multi Select Component sends all values that are currently selected as part of onChange
  const handleSetDashboardCharts = (values: string[]) => {
    setSelectedDashboardChartKeys(values);
  };

  //  Similar pattern to use-environment-filter.tsx
  return {
    selectedDashboardChartKeys,
    setSelectedDashboardChartKeys: handleSetDashboardCharts,
  };
}



