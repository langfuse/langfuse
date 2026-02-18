import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dashboardChartsBeta";

function getStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "true";
  } catch {
    return false;
  }
}

export function useDashboardChartsBeta() {
  const [isDashboardChartsBeta, setState] = useState(false);

  useEffect(() => {
    setState(getStored());
  }, []);

  const setDashboardChartsBeta = useCallback((enabled: boolean) => {
    setState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }, []);

  return {
    isDashboardChartsBeta,
    setDashboardChartsBeta,
  };
}
