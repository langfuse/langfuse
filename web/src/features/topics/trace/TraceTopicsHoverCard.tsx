import { useCanViewTopics } from "@/src/features/topics/topicsAccess";
import { api } from "@/src/utils/api";

/** Facet results of a trace; empty when Topics is unavailable or nothing was summarized. */
export function useTraceTopicFacets(trace: {
  projectId: string;
  id: string;
  timestamp: Date;
}) {
  const canViewTopics = useCanViewTopics(trace.projectId);
  return (
    api.topics.forTrace.useQuery(
      {
        projectId: trace.projectId,
        traceId: trace.id,
        timestamp: trace.timestamp,
      },
      { enabled: canViewTopics, staleTime: 60 * 1000 },
    ).data ?? []
  );
}
