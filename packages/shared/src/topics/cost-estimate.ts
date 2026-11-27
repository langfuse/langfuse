import type { FilterState } from "../types";
import type { TopicFacetRef } from "./index";

/** Finished traces the cost estimate loads and measures. */
export const TOPICS_COST_ESTIMATE_SAMPLE_SIZE = 50;
export const TOPICS_COST_ESTIMATE_MAX_FACETS = 50;

/** Token totals over the sampled traces Topics would summarize; skipped traces add nothing. */
export type TopicCostEstimateTokens = {
  /** System prompt, facet instructions, output schema and transcript. */
  inputTokens: number;
  /** Expected output: a fixed share per facet. */
  outputTokens: number;
  /** One embedding input per facet summary. */
  embeddingTokens: number;
};

export type TopicCostEstimate = {
  key: string;
  runId: string;
  status: "running" | "done" | "failed";
  /** Epoch milliseconds. */
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  inputs: {
    filter: FilterState;
    facets: TopicFacetRef[];
    summaryModel: string;
    embeddingModel: string | null;
  };
  /** Traces measured; fewer than the sample size when fewer finished or some were too large to read. */
  sampled: number;
  summarizable: number;
  skipped: { tooLarge: number; noContent: number };
  tokens: TopicCostEstimateTokens;
};

/** What one sampled trace costs on average, with skipped traces at $0. */
export type TopicCostEstimatePrices = {
  /** USD per sampled trace; null when a model has no known price. */
  perTraceUsd: number | null;
  summaryPriced: boolean;
  embeddingPriced: boolean;
};
