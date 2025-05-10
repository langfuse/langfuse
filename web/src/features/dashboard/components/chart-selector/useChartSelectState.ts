import useSessionStorage from "@/src/components/useSessionStorage";
import { chartDefinitions } from "@/src/features/dashboard/components/chart-selector/chartDefinitions";

export function useChartSelectState(
  // allChartKeys: string[],
  projectId: string,   // Assuming projectId is always available per ScoreAnalytics.tsx

) {
  //  Moving deconstruction of chartKeys here instead of index.tsx
  const allDashboardChartKeys = chartDefinitions.map((chart) => chart.key);

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
