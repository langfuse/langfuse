import { useState } from "react";
import { api, type RouterInputs } from "@/src/utils/api";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

type MetricsInput = RouterInputs["dashboard"]["executeQuery"];
type MetricsWindow = { fromTimestamp: string; toTimestamp: string };

const queryOptions = { refetchOnWindowFocus: false, staleTime: 60_000 };

export function useSkillAnalytics({
  projectId,
  skillId,
  timeRange,
}: {
  projectId: string;
  skillId: string;
  timeRange: TimeRange;
}) {
  // Freeze relative time until the range changes or analytics are refreshed.
  const [window, setWindow] = useState(() => getMetricsWindow(timeRange));
  const available = api.dashboard.executeQuery.useQuery(
    createMetricsQuery(projectId, skillId, window, "skillIdsAvailable"),
    queryOptions,
  );
  const loaded = api.dashboard.executeQuery.useQuery(
    createMetricsQuery(projectId, skillId, window, "skillIdsLoaded"),
    queryOptions,
  );
  const files = api.dashboard.executeQuery.useQuery(
    createMetricsQuery(projectId, skillId, window, "skillIdsLoaded", [
      { field: "loadedFilePaths" },
    ]),
    queryOptions,
  );

  async function handleRefresh() {
    if ("from" in timeRange) {
      await Promise.all([
        available.refetch(),
        loaded.refetch(),
        files.refetch(),
      ]);
      return;
    }
    setWindow(getMetricsWindow(timeRange));
  }

  return { available, loaded, files, handleRefresh };
}

function createMetricsQuery(
  projectId: string,
  skillId: string,
  window: MetricsWindow,
  column: "skillIdsAvailable" | "skillIdsLoaded",
  dimensions: MetricsInput["query"]["dimensions"] = [],
): MetricsInput {
  return {
    projectId,
    version: "v2",
    query: {
      view: "observations",
      dimensions,
      metrics: [{ measure: "count", aggregation: "count" }],
      filters: [
        { type: "arrayOptions", column, operator: "any of", value: [skillId] },
      ],
      timeDimension: null,
      ...window,
      orderBy: null,
    },
  };
}

function getMetricsWindow(timeRange: TimeRange): MetricsWindow {
  const range = toAbsoluteTimeRange(timeRange);
  return {
    fromTimestamp: (range?.from ?? new Date(0)).toISOString(),
    toTimestamp: (range?.to ?? new Date()).toISOString(),
  };
}
