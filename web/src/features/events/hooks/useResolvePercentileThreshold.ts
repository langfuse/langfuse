import { useCallback } from "react";
import { api } from "@/src/utils/api";

/**
 * Resolves a percentile threshold (e.g. "p95 of latency") over the project's
 * v4 observations within a time range, via the metrics query engine
 * (`dashboard.executeQuery`, v2 events-backed views).
 *
 * Used by percentile presets ("Slowest 5%"): the threshold is resolved once at
 * apply time and then written as a plain `number` filter — a snapshot, so the
 * resulting filter state stays shareable and pagination-stable. Population is
 * the selected time range only (other filters are deliberately ignored).
 *
 * Returns the raw measure value, or null when the range has no data. NOTE:
 * measure units can differ from the events-table filter columns (the `latency`
 * measure is milliseconds; the filter column is seconds) — callers own the
 * conversion.
 */
export function useResolvePercentileThreshold(projectId: string) {
  const utils = api.useUtils();

  return useCallback(
    async (params: {
      measure: string;
      percentile: "p50" | "p75" | "p90" | "p95" | "p99";
      from: Date;
      to: Date;
    }): Promise<number | null> => {
      const { measure, percentile, from, to } = params;
      const rows = await utils.dashboard.executeQuery.fetch({
        projectId,
        version: "v2",
        query: {
          view: "observations",
          dimensions: [],
          metrics: [{ measure, aggregation: percentile }],
          filters: [],
          timeDimension: null,
          fromTimestamp: from.toISOString(),
          toTimestamp: to.toISOString(),
          orderBy: null,
        },
      });

      const row = rows?.[0] as Record<string, unknown> | undefined;
      const value = Number(row?.[`${percentile}_${measure}`]);
      return Number.isFinite(value) ? value : null;
    },
    [projectId, utils],
  );
}
