import { z } from "zod";
import { singleFilterList } from "../interfaces/filters";

export const TOPICS_SUMMARY_MODEL = "global.openai.gpt-5.6-luna";
export const TOPICS_EMBEDDING_MODEL = "cohere.embed-v4:0";

export const topicIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const topicTraceIdSchema = z.string().min(1).max(1000);
export const topicEmbeddingConfigSchema = z.object({
  embeddingModel: z
    .literal(TOPICS_EMBEDDING_MODEL)
    .default(TOPICS_EMBEDDING_MODEL),
  embeddingDimensions: z
    .number()
    .refine((value) => [256, 512, 1024, 1536].includes(value), {
      message: "Choose 256, 512, 1024, or 1536 embedding dimensions.",
    })
    .default(1024),
});
export type TopicEmbeddingConfig = z.infer<typeof topicEmbeddingConfigSchema>;
export const topicProcessingConfigSchema = z.object({
  summaryModel: z.literal(TOPICS_SUMMARY_MODEL).default(TOPICS_SUMMARY_MODEL),
  maxInputTokens: z.number().int().min(256).max(8000).default(8000),
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
  limit: z.number().int().positive().nullable().default(null),
  sampling: z.enum(["random", "latest"]),
});
export const topicTraceSelectionCriteriaSchema = topicRuleConfigSchema
  .extend({
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
      traceSelection: topicTraceSelectionSnapshotSchema.optional(),
      processingConfig: topicProcessingConfigSchema.default(() =>
        topicProcessingConfigSchema.parse({}),
      ),
    })
    .strict(),
  z
    .object({
      ...executionBase,
      operation: z.literal("update"),
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
  id: string;
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
export type TopicAssignment = z.infer<typeof topicSourceSchema> & {
  coordinates: [number, number] | null;
  projectId: string;
  facetId: string;
  facetVersion: number;
  environment: string;
  traceName: string;
  unitStartTime: string;
  summaryId: string;
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
  representativeSummaryIds: string[];
  metadata: Record<string, unknown>;
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
    summaryId: string;
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
    | Omit<
        Extract<TopicExecutionInput, { operation: "process" }>,
        "traceIds" | "traceSelection"
      >
    | Extract<TopicExecutionInput, { operation: "update" }>;
};
