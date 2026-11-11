import {
  TOPICS_MINIMUM_SUMMARY_COUNT,
  type TopicOperation,
} from "@langfuse/shared/topics";

export function manualTopicsSelection({
  operation,
  summaryCounts,
  traceCount,
}: {
  operation: TopicOperation;
  summaryCounts: number[];
  traceCount: number;
}): { ready: boolean; disabledReason: string | null } {
  if (summaryCounts.length === 0)
    return {
      ready: false,
      disabledReason: "Select at least one active facet.",
    };
  if (operation === "process")
    return { ready: traceCount > 0, disabledReason: null };
  if (!summaryCounts.some((count) => count > 0))
    return {
      ready: false,
      disabledReason:
        "No summaries are available for the selected facets. Summarize traces first.",
    };
  if (!summaryCounts.some((count) => count >= TOPICS_MINIMUM_SUMMARY_COUNT))
    return {
      ready: false,
      disabledReason: `Each selected facet has fewer than ${TOPICS_MINIMUM_SUMMARY_COUNT} summaries. Summarize more traces or widen the time range.`,
    };
  return { ready: true, disabledReason: null };
}
