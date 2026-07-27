import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

type UseDashboardFilterOptionsParams = {
  projectId: string;
  isBetaEnabled: boolean;
  timeRange: TimeRange;
};

export function useDashboardFilterOptions({
  projectId,
  isBetaEnabled,
  timeRange,
}: UseDashboardFilterOptionsParams) {
  const commonQueryOptions = {
    trpc: { context: { skipBatch: true } },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  } as const;

  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange) ?? undefined,
    [timeRange],
  );

  const traceTimestampFilter = useMemo(
    () =>
      absoluteTimeRange
        ? [
            {
              column: "timestamp",
              type: "datetime" as const,
              operator: ">=" as const,
              value: absoluteTimeRange.from,
            },
            ...(absoluteTimeRange.to
              ? [
                  {
                    column: "timestamp",
                    type: "datetime" as const,
                    operator: "<=" as const,
                    value: absoluteTimeRange.to,
                  },
                ]
              : []),
          ]
        : undefined,
    [absoluteTimeRange],
  );

  const startTimeFilter = useMemo(
    () =>
      absoluteTimeRange
        ? [
            {
              column: "startTime",
              type: "datetime" as const,
              operator: ">=" as const,
              value: absoluteTimeRange.from,
            },
            ...(absoluteTimeRange.to
              ? [
                  {
                    column: "startTime",
                    type: "datetime" as const,
                    operator: "<=" as const,
                    value: absoluteTimeRange.to,
                  },
                ]
              : []),
          ]
        : undefined,
    [absoluteTimeRange],
  );

  // Gate on projectId: on a direct URL load the first render happens before
  // the router query hydrates, and firing with projectId=undefined surfaces
  // a "Bad Request" toast.
  const traceFilterOptions = api.traces.filterOptions.useQuery(
    { projectId, timestampFilter: traceTimestampFilter },
    { ...commonQueryOptions, enabled: Boolean(projectId) && !isBetaEnabled },
  );

  const eventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId, startTimeFilter },
    { ...commonQueryOptions, enabled: Boolean(projectId) && isBetaEnabled },
  );

  const nameOptions = useMemo(
    () =>
      isBetaEnabled
        ? normalizeSingleValueOptions(eventsFilterOptions.data?.traceName)
        : normalizeSingleValueOptions(traceFilterOptions.data?.name),
    [
      isBetaEnabled,
      eventsFilterOptions.data?.traceName,
      traceFilterOptions.data?.name,
    ],
  );

  const tagsOptions = isBetaEnabled
    ? (eventsFilterOptions.data?.traceTags ?? [])
    : (traceFilterOptions.data?.tags ?? []);

  return { nameOptions, tagsOptions };
}
