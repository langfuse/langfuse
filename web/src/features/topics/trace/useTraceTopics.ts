import useLocalStorage from "@/src/components/useLocalStorage";
import { useCanViewTopics } from "@/src/features/topics/topicsAccess";
import { api, type RouterOutputs } from "@/src/utils/api";

export type TraceTopicFacet =
  RouterOutputs["topics"]["forTraces"][string][number];

/** Current facet results of a trace; empty when Topics is unavailable or nothing was summarized. */
export function useTraceTopics(trace: {
  projectId: string;
  id: string;
  timestamp: Date;
}) {
  const canViewTopics = useCanViewTopics(trace.projectId);
  const query = api.topics.forTraces.useQuery(
    {
      projectId: trace.projectId,
      traces: [{ traceId: trace.id, timestamp: trace.timestamp }],
    },
    { enabled: canViewTopics, staleTime: 60 * 1000 },
  );
  return query.data?.[trace.id] ?? [];
}

export const TRACE_TOPICS_HEADER_VARIANTS = [
  "badges",
  "card",
  "strip",
] as const;
export type TraceTopicsHeaderVariant =
  (typeof TRACE_TOPICS_HEADER_VARIANTS)[number];

/** Testing-only switch between the three header presentations. */
export function useTraceTopicsHeaderVariant() {
  return useLocalStorage<TraceTopicsHeaderVariant>(
    "trace-topics-header-variant",
    "card",
  );
}
