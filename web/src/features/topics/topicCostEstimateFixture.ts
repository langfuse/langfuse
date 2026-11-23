import type { TopicCostEstimate } from "@langfuse/shared/topics";

/** A finished estimate for stories; override fields to show other states. */
export const costEstimateFixture = (
  overrides: Partial<TopicCostEstimate> = {},
  perTraceUsd: number | null = 0.0042,
) => ({
  key: "0123456789abcdef0123456789abcdef",
  runId: "run-1",
  status: "done" as const,
  startedAt: 0,
  finishedAt: 1_000,
  error: null,
  inputs: {
    filter: [],
    facets: [{ facetId: "intent", version: 1 }],
    summaryModel: "gpt-5.6-luna",
    embeddingModel: "text-embedding-3-small",
  },
  finishedTraces7d: 6_677,
  sampled: 50,
  processed: 50,
  summarizable: 50,
  skipped: { tooLarge: 0, noContent: 0 },
  tokens: {
    prefixTokens: 50 * 2_400,
    inputTokens: 50 * 1_800,
    outputTokens: 50 * 120,
    embeddingTokens: 50 * 80,
  },
  traceNames: [],
  ...overrides,
  prices: {
    perTraceUsd,
    summaryPriced: perTraceUsd !== null,
    embeddingPriced: true,
  },
});
