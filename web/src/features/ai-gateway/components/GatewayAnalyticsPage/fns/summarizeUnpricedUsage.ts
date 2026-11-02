export type GatewayUnpricedUsage = {
  requests: number;
  tokens: number;
  models: string[];
};

/**
 * Picks the models whose requests recorded no cost from a per-model breakdown.
 * Events store a missing price as a zero cost, so a model with requests and a
 * zero total has no Langfuse price and its spend reads as $0.
 */
export function summarizeUnpricedUsage(
  rows: Record<string, unknown>[],
): GatewayUnpricedUsage {
  const summary: GatewayUnpricedUsage = { requests: 0, tokens: 0, models: [] };
  for (const row of rows) {
    const requests = Number(row.count_count ?? 0);
    const cost = Number(row.sum_totalCost ?? 0);
    if (requests <= 0 || cost !== 0) continue;
    summary.requests += requests;
    summary.tokens += Number(row.sum_totalTokens ?? 0);
    summary.models.push(String(row.providedModelName || "Unknown model"));
  }
  return summary;
}
