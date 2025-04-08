import { api } from "@/src/utils/api";
import { useMemo } from "react";

export function useTraceFilterOptions({ projectId }: { projectId: string }) {
  const traceFilterOptionsResponse = api.traces.filterOptions.useQuery(
    { projectId },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const environmentFilterOptionsResponse =
    api.projects.environmentFilterOptions.useQuery(
      { projectId },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const traceFilterOptions = useMemo(() => {
    return {
      ...(traceFilterOptionsResponse.data ?? {}),
      environment: environmentFilterOptionsResponse.data?.map((e) => ({
        value: e.environment,
      })),
    };
  }, [traceFilterOptionsResponse.data, environmentFilterOptionsResponse.data]);

  return traceFilterOptions;
}
