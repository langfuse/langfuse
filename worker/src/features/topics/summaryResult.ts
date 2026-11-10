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

// Token counts are stored as integers and costs with 12 decimals.
const COST_UNITS = 1e12;

function splitDetails(
  details: Record<string, number>,
  count: number,
  units: number,
): Record<string, number>[] {
  const shares = Array.from(
    { length: count },
    () => ({}) as Record<string, number>,
  );
  const { total, ...parts } = details;
  const split = (key: string, value: number) => {
    const scaled = Math.round(value * units);
    const base = Math.floor(scaled / count);
    // The remainder goes to the first rows, so the shares add up to the value.
    shares.forEach((share, index) => {
      share[key] = (base + (index < scaled - base * count ? 1 : 0)) / units;
    });
  };
  for (const [key, value] of Object.entries(parts)) split(key, value);
  if (total === undefined) return shares;
  const unit = (value: number) => Math.round(value * units);
  const sum = (values: number[]) => values.reduce((a, b) => a + unit(b), 0);
  // A total that is the sum of its parts stays the sum of each row's own parts.
  if (unit(total) === sum(Object.values(parts)))
    for (const share of shares) share.total = sum(Object.values(share)) / units;
  else split("total", total);
  return shares;
}

/** Splits one call's usage evenly across the rows it produced. */
export function splitTopicModelUsage(
  usage: TopicModelUsage,
  count: number,
): TopicModelUsage[] {
  const providedUsage = splitDetails(usage.providedUsageDetails, count, 1);
  const usageDetails = splitDetails(usage.usageDetails, count, 1);
  const providedCost = splitDetails(
    usage.providedCostDetails,
    count,
    COST_UNITS,
  );
  const costDetails = splitDetails(usage.costDetails, count, COST_UNITS);
  return Array.from({ length: count }, (_, index) => ({
    providedUsageDetails: providedUsage[index],
    usageDetails: usageDetails[index],
    providedCostDetails: providedCost[index],
    costDetails: costDetails[index],
  }));
}
