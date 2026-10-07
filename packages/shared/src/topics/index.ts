import { z } from "zod";
import { singleFilterList } from "../interfaces/filters";
import { LLMAdapter } from "../server/llm/types";

export const topicIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const topicTraceIdSchema = z.string().min(1).max(1000);
export const topicTimeRangeSchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine(({ from, to }) => from < to, {
    message: "Choose an end time after the start time.",
    path: ["to"],
  });
export type TopicTimeRange = z.infer<typeof topicTimeRangeSchema>;
export const topicEmbeddingConfigSchema = z.object({
  embeddingModel: z.string().trim().min(1).optional(),
  embeddingDimensions: z
    .number()
    .int("Embedding dimensions must be a whole number.")
    .min(64, "Use at least 64 embedding dimensions.")
    .max(4096, "Use at most 4,096 embedding dimensions.")
    .default(1024),
});
export type TopicEmbeddingConfig = z.infer<typeof topicEmbeddingConfigSchema>;

export const TOPICS_MODEL_SLOTS = ["summary", "embedding", "naming"] as const;
export type TopicsModelSlotName = (typeof TOPICS_MODEL_SLOTS)[number];
// Every slot must support embeddings or structured output; Anthropic has no embeddings API.
export const TOPICS_SUPPORTED_ADAPTERS: readonly string[] = [
  LLMAdapter.OpenAI,
  LLMAdapter.Azure,
  LLMAdapter.Bedrock,
  LLMAdapter.GoogleAIStudio,
  LLMAdapter.VertexAI,
];
export const TOPICS_MODEL_SLOT_DETAILS: Record<
  TopicsModelSlotName,
  { label: string; recommendation: string }
> = {
  summary: {
    label: "Facet summaries",
    recommendation:
      "A small, fast model such as GPT-6 Luna. It runs once per trace.",
  },
  embedding: {
    label: "Embeddings",
    recommendation:
      "An embedding model such as text-embedding-3-small or Cohere Embed v4. It cannot be changed once summaries are embedded.",
  },
  naming: {
    label: "Topic naming",
    recommendation:
      "A stronger model such as GPT-5.6 Terra or Claude Sonnet. It runs once per topic.",
  },
};
const topicsModelSlotSchema = z.object({
  llmApiKeyId: z.string().min(1),
  model: z.string().trim().min(1).max(256),
});
export const topicsModelSettingsSchema = z.object({
  summary: topicsModelSlotSchema.nullable(),
  embedding: topicsModelSlotSchema.nullable(),
  embeddingDimensions:
    topicEmbeddingConfigSchema.shape.embeddingDimensions.unwrap(),
  naming: topicsModelSlotSchema.nullable(),
  enabled: z.boolean(),
});
export type TopicsModelSettings = z.infer<typeof topicsModelSettingsSchema>;
export const topicProcessingConfigSchema = z.object({
  summaryModel: z.string().trim().min(1).optional(),
  maxInputTokens: z.number().int().min(256).max(120_000).default(120_000),
  maxOutputTokens: z.number().int().min(64).max(512).default(512),
});
export type TopicProcessingConfig = z.infer<typeof topicProcessingConfigSchema>;
export const topicMinimumTraceCountSchema = z.number().int().min(3);

export const topicRuleConfigSchema = z.object({
  filter: singleFilterList
    .refine((filters) => filters.length <= 100, "Select at most 100 filters.")
    .refine(
      (filters) => !filters.some((item) => item.type === "positionInTrace"),
      "Position-in-trace filters are not supported for Topics selection.",
    ),
});
export const topicTraceSelectionCriteriaSchema = topicRuleConfigSchema
  .extend({
    limit: z.number().int().positive().nullable().default(null),
    sampling: z.enum(["random", "latest"]),
    from: z.coerce.date(),
    to: z.coerce.date(),
    seed: z.string().min(1).max(128),
  })
  .refine(({ from, to }) => from < to, {
    message: "Choose an end time after the start time.",
    path: ["to"],
  })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 93 * 86400000, {
    message: "Select at most 93 days of traces.",
    path: ["from"],
  });
export const topicTraceSelectionSnapshotSchema =
  topicTraceSelectionCriteriaSchema.safeExtend({
    excludedTraceIds: z.array(topicTraceIdSchema).default([]),
  });
export type TopicRule = z.infer<typeof topicRuleConfigSchema> & {
  id: string;
  projectId: string;
  name: string;
  facetIds: string[];
  updatedAt: string;
};

export const topicFacetRefSchema = z.object({
  facetId: topicIdSchema,
  version: z.number().int().positive(),
});
export type TopicFacetRef = z.infer<typeof topicFacetRefSchema>;

const executionBase = {
  projectId: topicIdSchema,
  requestId: topicIdSchema,
  facets: z.array(topicFacetRefSchema).min(1),
  embeddingConfig: topicEmbeddingConfigSchema.default(() =>
    topicEmbeddingConfigSchema.parse({}),
  ),
};
export const topicExecutionInputSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...executionBase,
      operation: z.literal("process"),
      traceIds: z.array(topicTraceIdSchema).min(1),
      reuseExistingSummaries: z.boolean().default(false),
      ruleId: topicIdSchema.optional(),
      processingConfig: topicProcessingConfigSchema.default(() =>
        topicProcessingConfigSchema.parse({}),
      ),
    })
    .strict(),
  z
    .object({
      ...executionBase,
      operation: z.literal("update"),
      timeRange: topicTimeRangeSchema,
      exploratory: z.boolean().default(false),
      minimumTraceCount: topicMinimumTraceCountSchema.optional(),
    })
    .strict(),
]);
export type TopicExecutionInput = z.infer<typeof topicExecutionInputSchema>;
export type TopicOperation = TopicExecutionInput["operation"];
export type TopicExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed";
export type TopicFacetOutcome =
  | "pending"
  | "published"
  | "assigned"
  | "awaiting_topics"
  | "insufficient_data"
  | "no_applicable_summaries"
  | "no_topics"
  | "failed";
export type TopicSummaryState =
  | "summarized"
  | "complete"
  | "not_applicable"
  | "insufficient_input";

export interface TopicFacetVersion {
  projectId: string;
  facetId: string;
  version: number;
  prompt: string;
  createdAt: string;
}
export interface TopicFacet {
  id: string;
  projectId: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  versions: TopicFacetVersion[];
}
export const topicSourceSchema = z.union([
  z.object({
    traceId: z.string().min(1),
    sessionId: z.string().min(1).nullable(),
  }),
  z.object({ traceId: z.null(), sessionId: z.string().min(1) }),
]);

export type TopicSummary = z.infer<typeof topicSourceSchema> & {
  projectId: string;
  facetId: string;
  facetVersion: number;
  triggerType: "manual_poc";
  environment: string;
  traceName: string;
  unitStartTime: string;
  state: TopicSummaryState;
  summary: string;
  embedding: number[];
  transcriptId: string;
  transcriptVersion: string;
  summaryModel: string;
  embeddingModel: string;
  providedUsageDetails: Record<string, number>;
  usageDetails: Record<string, number>;
  providedCostDetails: Record<string, number>;
  costDetails: Record<string, number>;
  processedAt: string;
  metadata: Record<string, unknown>;
};

/** Local references use source identity; a trace's parent session is metadata. */
export function topicSourceKey(
  source: Pick<
    TopicSummary,
    "projectId" | "facetId" | "facetVersion" | "traceId" | "sessionId"
  >,
): string {
  return JSON.stringify([
    source.projectId,
    source.facetId,
    source.facetVersion,
    source.traceId !== null ? "trace" : "session",
    source.traceId ?? source.sessionId,
  ]);
}
export type TopicAssignment = z.infer<typeof topicSourceSchema> & {
  coordinates: [number, number] | null;
  projectId: string;
  facetId: string;
  facetVersion: number;
  environment: string;
  traceName: string;
  unitStartTime: string;
  summaryProcessedAt: string;
  runId: string | null;
  topicId: string | null;
  topicVersionId: string | null;
  distance: number | null;
  runnerUpDistance: number | null;
  origin: "initial" | "online" | "backfill";
  assignedAt: string;
};
export interface TopicDefinition {
  topicVersionId: string;
  projectId: string;
  topicId: string;
  createdByRunId: string;
  createdAt: string;
  tags: string[];
  name: string;
  description: string;
  centroid: number[];
  radius: number;
  representativeSummaries: Pick<
    TopicSummary,
    "facetId" | "facetVersion" | "traceId" | "sessionId"
  >[];
  metadata: Record<string, unknown>;
}

/** Compares finite classifier geometry with a bounded Float64 roundoff tolerance. */
export function sameTopicGeometry(
  left: Pick<TopicDefinition, "centroid" | "radius">,
  right: Pick<TopicDefinition, "centroid" | "radius">,
): boolean {
  const sameNumber = (a: number, b: number) =>
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <=
      8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  if (
    !left.centroid.length ||
    left.centroid.length !== right.centroid.length ||
    !sameNumber(left.radius, right.radius)
  )
    return false;
  for (let index = 0; index < left.centroid.length; index++) {
    if (!sameNumber(left.centroid[index], right.centroid[index])) return false;
  }
  return true;
}

export interface TopicRun {
  id: string;
  projectId: string;
  facetId: string;
  facetVersion: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  config: Record<string, unknown>;
  error: string | null;
  topics: TopicDefinition[];
}
export interface TopicFacetProgress {
  facetId: string;
  facetVersion: number;
  outcome: TopicFacetOutcome;
  runId: string | null;
  error: string | null;
  counts: {
    requested: number;
    complete: number;
    nonApplicable: number;
    insufficientInput: number;
    failed: number;
    assigned: number;
    outlier: number;
  };
}
export interface TopicExecution {
  id: string;
  projectId: string;
  input: TopicExecutionInput;
  status: TopicExecutionStatus;
  phase: string;
  createdAt: string;
  updatedAt: string;
  facets: TopicFacetProgress[];
  traceErrors: { traceId: string; error: string }[];
  error: string | null;
}

/** Retry state for one bounded trace batch, retained with its BullMQ job. */
export interface TopicProcessBatchState {
  execution: TopicExecution;
  summaries: {
    facetId: string;
    facetVersion: number;
    traceId: string;
  }[];
  failedTraceIds: {
    facetId: string;
    facetVersion: number;
    traceIds: string[];
  }[];
  summarized: boolean;
  assignedAt?: string;
}

/** Progress and history omit per-trace inputs, summary references and errors. */
export type TopicExecutionSummary = Omit<
  TopicExecution,
  "input" | "traceErrors"
> & {
  input:
    | Omit<Extract<TopicExecutionInput, { operation: "process" }>, "traceIds">
    | Extract<TopicExecutionInput, { operation: "update" }>;
};
