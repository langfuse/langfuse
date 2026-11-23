import type { FilterState } from "../types";
import type { TopicFacetRef } from "./index";

/** Finished traces the cost estimate loads and measures. */
export const TOPICS_COST_ESTIMATE_SAMPLE_SIZE = 50;
/** Expected output tokens of one facet's summary. */
export const TOPICS_COST_ESTIMATE_OUTPUT_TOKENS_PER_FACET = 60;
/** Expected embedding input of one facet's summary. */
export const TOPICS_COST_ESTIMATE_EMBEDDING_TOKENS_PER_FACET = 40;
/** Processed traces before a running estimate shows a cost so far. */
export const TOPICS_COST_ESTIMATE_PARTIAL_MIN_TRACES = 10;
/** A finished estimate for the same inputs is reused this long instead of rerun. */
export const TOPICS_COST_ESTIMATE_COOLDOWN_MS = 15 * 60_000;

/** Tokenizer family of a model, which picks the characters-per-token ratio. */
export type TopicTokenizerFamily = "openai" | "gemini" | "claude" | "other";

/** Characters per token, measured on rendered Topics requests. */
export const TOPICS_CHARS_PER_TOKEN: Record<TopicTokenizerFamily, number> = {
  openai: 4.0,
  gemini: 4.0,
  claude: 3.2,
  other: 3.5,
};

export function topicTokenizerFamily(model: string): TopicTokenizerFamily {
  const name = model.toLowerCase();
  if (/(^|[/.:])(gpt|o\d|chatgpt|text-embedding)/.test(name)) return "openai";
  if (name.includes("gemini")) return "gemini";
  if (name.includes("claude")) return "claude";
  return "other";
}

/** Token totals over the sampled traces Topics would summarize; skipped traces add nothing. */
export type TopicCostEstimateTokens = {
  /** System prompt and facet instructions, sent with every trace. */
  prefixTokens: number;
  /** Transcript and closing instruction. */
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
  /** Finished traces matching the filter in the last 7 days, before sampling. */
  finishedTraces7d: number | null;
  /** Traces drawn for the sample; fewer than the sample size when fewer finished. */
  sampled: number;
  processed: number;
  summarizable: number;
  skipped: { tooLarge: number; noContent: number };
  tokens: TopicCostEstimateTokens;
  traceNames: Array<{ name: string; count: number }>;
};

/** What one sampled trace costs on average, with skipped traces at $0. */
export type TopicCostEstimatePrices = {
  /** USD per processed trace; null when a model has no known price. */
  perTraceUsd: number | null;
  summaryPriced: boolean;
  embeddingPriced: boolean;
};
