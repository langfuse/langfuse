import { type TopicOperation } from "@langfuse/shared/topics";

export function manualTopicsSelection({
  operation,
  summaryCounts,
  traceCount,
  smallSample,
}: {
  operation: TopicOperation;
  summaryCounts: number[];
  traceCount: number;
  smallSample: boolean;
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
  const minimum = smallSample ? 10 : 100;
  if (!summaryCounts.some((count) => count >= minimum))
    return {
      ready: false,
      disabledReason: smallSample
        ? "Each selected facet has fewer than 10 summaries. Summarize more traces or widen the time range."
        : "Each selected facet has fewer than 100 summaries. Enable small sample mode, summarize more traces, or widen the time range.",
    };
  return { ready: true, disabledReason: null };
}
