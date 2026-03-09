import { useMemo } from "react";
import { api } from "@/src/utils/api";

type UseDashboardFilterOptionsParams = {
  projectId: string;
  isBetaEnabled: boolean;
};

const toNameOption = (n: { value: string; count: string | number }) => ({
  value: n.value,
  count: Number(n.count),
});

export function useDashboardFilterOptions({
  projectId,
  isBetaEnabled,
}: UseDashboardFilterOptionsParams) {
  const commonQueryOptions = {
    trpc: { context: { skipBatch: true } },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  } as const;

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    { projectId },
    { ...commonQueryOptions, enabled: !isBetaEnabled },
  );

  const eventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId },
    { ...commonQueryOptions, enabled: isBetaEnabled },
  );

  const nameOptions = useMemo(
    () =>
      isBetaEnabled
        ? (eventsFilterOptions.data?.traceName?.map(toNameOption) ?? [])
        : (traceFilterOptions.data?.name?.map(toNameOption) ?? []),
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
