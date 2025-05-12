import useSessionStorage from "@/src/components/useSessionStorage";
import { dashboardChartDefinitions } from "@/src/features/dashboard/constants/chartDefinitions";
import { useEffect, useMemo } from "react";

export function useChartSelectState(projectId: string) {
  // Extract static dashboard chart definitions keys list
  const allDashboardChartKeys = useMemo<string[]>(
    () => dashboardChartDefinitions.map((chart) => chart.key),
    [],
  );

  // Initialise all keys in storage as all charts are visible by default
  const [selectedDashboardChartKeys, setSelectedDashboardChartKeys] =
    useSessionStorage<string[]>(
      `selectedDashboardChartKeys-${projectId}`,
      allDashboardChartKeys,
    );

  // Validate stored dashboard key names against defined list - clear out any invalid keys (eg if a chart was removed) or reset back to all charts if empty to avoid edge cases of no charts loading
  useEffect(() => {
    const validStoredDashboardKeys = selectedDashboardChartKeys.filter((key) =>
      allDashboardChartKeys.includes(key),
    );

    const invalidKeysFound =
      validStoredDashboardKeys.length !== selectedDashboardChartKeys.length;

    const noValidKeysFound =
      validStoredDashboardKeys.length === 0 && allDashboardChartKeys.length > 0;

    if (invalidKeysFound || noValidKeysFound) {
      // If no valid keys found, reset - otherwise keep valid keys
      setSelectedDashboardChartKeys(
        noValidKeysFound ? allDashboardChartKeys : validStoredDashboardKeys,
      );
    }
  }, [
    allDashboardChartKeys,
    selectedDashboardChartKeys,
    setSelectedDashboardChartKeys,
  ]);

  const handleSetDashboardCharts = (chartsToShow: string[]) => {
    // Fallback UX handling: Ensure that at least one chart is always selected to avoid triggering the empty list fallback & causing all charts to reappear
    if (chartsToShow.length === 0) {
      const lastDeselectedChart = selectedDashboardChartKeys.find(
        (key) => !chartsToShow.includes(key),
      );

      if (lastDeselectedChart) {
        setSelectedDashboardChartKeys([lastDeselectedChart]);
      } else {
        // Catch if last deselected chart can't be identified
        if (allDashboardChartKeys.length > 0) {
          setSelectedDashboardChartKeys([allDashboardChartKeys[0]]);
        } else {
          // Edge case fallback: No defined charts
          setSelectedDashboardChartKeys([]);
        }
      }

      return;
    }

    setSelectedDashboardChartKeys(chartsToShow);
  };

  return {
    selectedDashboardCharts: selectedDashboardChartKeys,
    setSelectedDashboardCharts: handleSetDashboardCharts,
  };
}
