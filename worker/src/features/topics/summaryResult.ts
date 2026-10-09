import type { TopicSummary } from "@langfuse/shared/topics";

export type TopicModelUsage = Pick<
  TopicSummary,
  | "providedUsageDetails"
  | "usageDetails"
  | "providedCostDetails"
  | "costDetails"
>;

export function topicSummaryOutputError(output: {
  summary: string;
  status: "applicable" | "not_applicable" | "insufficient_input";
}): string | undefined {
  const summary = output.summary.trim();
  // Models sometimes add text to a non-applicable result; callers keep the status and drop the text.
  if (output.status === "applicable" && (!summary || summary.length > 2000))
    return "Applicable facet summary must contain a concise summary.";
}

function mergeDetails(
  summary: Record<string, number>,
  embedding: Record<string, number>,
): Record<string, number> {
  const details = { ...summary, ...embedding };
  if (Object.keys(details).length)
    details.total =
      (summary.total ??
        Object.values(summary).reduce((sum, value) => sum + value, 0)) +
      (embedding.total ??
        Object.values(embedding).reduce((sum, value) => sum + value, 0));
  return details;
}

export function mergeTopicModelUsage(
  summary: TopicModelUsage,
  embedding: TopicModelUsage,
): TopicModelUsage {
  return {
    providedUsageDetails: mergeDetails(
      summary.providedUsageDetails,
      embedding.providedUsageDetails,
    ),
    usageDetails: mergeDetails(summary.usageDetails, embedding.usageDetails),
    providedCostDetails: mergeDetails(
      summary.providedCostDetails,
      embedding.providedCostDetails,
    ),
    costDetails: mergeDetails(summary.costDetails, embedding.costDetails),
  };
}
