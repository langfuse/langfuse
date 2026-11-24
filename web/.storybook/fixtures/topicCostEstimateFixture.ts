import { type TopicCostEstimate } from "@langfuse/shared/topics";

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
  sampled: 50,
  summarizable: 50,
  skipped: { tooLarge: 0, noContent: 0 },
  tokens: {
    inputTokens: 50 * 4_200,
    outputTokens: 50 * 120,
    embeddingTokens: 50 * 80,
  },
  ...overrides,
  prices: {
    perTraceUsd,
    summaryPriced: perTraceUsd !== null,
    embeddingPriced: true,
  },
});
