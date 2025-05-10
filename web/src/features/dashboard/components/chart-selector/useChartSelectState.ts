import useSessionStorage from "@/src/components/useSessionStorage";
import { chartDefinitions } from "@/src/features/dashboard/components/chart-selector/chartDefinitions";
import { useEffect, useMemo } from "react";

interface Chart {
  key: string;
  label: string;
}

export function useChartSelectState(
  projectId: string, // Assuming projectId is always available per ScoreAnalytics.tsx
) {
  const allDashboardCharts = useMemo<Chart[]>(
    () => chartDefinitions,
    [],
  );

  const allDashboardChartKeys = useMemo<string[]>(
    () => allDashboardCharts.map((chart) => chart.key),
    [allDashboardCharts],
  );

  // if (allDashboardChartKeys.length === 0) {
  //   console.warn('No dashboard chart definitions found, this may indicate a configuration issue & cause issues with the show/hide chart filter');
  // }

  // const allDashboardCharts: ChartArray = chartDefinitions;
  // const allDashboardChartKeys: string[] = allDashboardCharts.map((chart) => chart.key);

  //  Moving deconstruction of chartKeys here instead of index.tsx
  // const allDashboardChartKeys: ChartArray = chartDefinitions.map((chart) => chart.key);

  // Using similar storage naming pattern as ScoreAnalytics.tsx
  const [selectedDashboardChartKeys, setSelectedDashboardChartKeys] =
    useSessionStorage<string[]>(
      `selectedDashboardChartKeys-${projectId}`,
      allDashboardChartKeys,
    );

  // Validate stored dashboard key names on mount - clear out any invalid keys (eg if a chart was removed) or reset if none are valid
  useEffect(() => {
    const validStoredKeys = selectedDashboardChartKeys.filter((key) =>
      allDashboardChartKeys.includes(key),
    );

    if (validStoredKeys.length !== selectedDashboardChartKeys.length) {
      setSelectedDashboardChartKeys(
        validStoredKeys.length ? validStoredKeys : allDashboardChartKeys,
      );
    }
  });

  // Multi Select Component sends all values that are currently selected as part of onChange
  // Ensure at least one chart is always selected - allows for fallback without breaking user experience
  const handleSetDashboardCharts = (newValues: string[]) => {
    // If trying to deselect all charts, keep the last attempted deselection
    if (newValues.length === 0) {
      // Find the difference between current and new selection to identify the last deselected chart
      const lastDeselected = selectedDashboardChartKeys.find(
        (key) => !newValues.includes(key),
      );
      // Keep the last chart selected
      setSelectedDashboardChartKeys(
        lastDeselected ? [lastDeselected] : [allDashboardChartKeys[0]],
      );
      return;
    }

    setSelectedDashboardChartKeys(newValues);
  };

  // Multi Select Component sends all values that are currently selected as part of onChange
  // const handleSetDashboardCharts = (values: string[]) => {
  //   setSelectedDashboardChartKeys(values);
  // };

  //  Similar pattern to use-environment-filter.tsx
  return {
    selectedDashboardChartKeys,
    setSelectedDashboardChartKeys: handleSetDashboardCharts,
  };
}
