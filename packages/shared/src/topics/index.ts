import { z } from "zod";
import { singleFilterList } from "../interfaces/filters";

export const TOPICS_SUMMARY_MODEL = "gpt-4.1-nano";
export const TOPICS_EMBEDDING_MODEL = "text-embedding-3-small";

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
  embeddingDimensions: z.number().int().min(16).max(1536).default(768),
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

const executionBase = {
  projectId: topicIdSchema,
  requestId: topicIdSchema,
  facetVersionIds: z.array(topicIdSchema).min(1),
  ruleId: topicIdSchema.optional(),
  traceSelection: topicTraceSelectionSnapshotSchema.optional(),
  processingConfig: topicProcessingConfigSchema.default(() =>
    topicProcessingConfigSchema.parse({}),
  ),
  exploratory: z.boolean().default(false),
  minimumTraceCount: topicMinimumTraceCountSchema.optional(),
  embeddingConfig: topicEmbeddingConfigSchema.default(() =>
    topicEmbeddingConfigSchema.parse({}),
  ),
  forceRefresh: z.boolean().default(false),
};
export const topicExecutionInputSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...executionBase,
      operation: z.literal("discover"),
      traceIds: z.array(topicTraceIdSchema).min(1),
    })
    .strict(),
  z
    .object({
      ...executionBase,
      operation: z.literal("assign"),
      traceIds: z.array(topicTraceIdSchema).min(1),
      targetRunIds: z.record(topicIdSchema, topicIdSchema),
    })
    .strict()
    .refine(
      (value) => value.facetVersionIds.every((id) => value.targetRunIds[id]),
      { message: "Select a target map for every facet." },
    ),
  z
    .object({
      ...executionBase,
      operation: z.literal("recluster"),
      sourceExecutionIds: z.array(topicIdSchema).min(1),
    })
    .strict(),
  z
    .object({
      ...executionBase,
      operation: z.literal("refresh"),
      traceIds: z.array(topicTraceIdSchema).min(1),
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
  id: string;
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
  publishedRunId: string | null;
  versions: TopicFacetVersion[];
}
export interface TopicSummary {
  id: string;
  projectId: string;
  facetId: string;
  facetVersionId: string;
  facetVersion: number;
  traceId: string;
  unitType: "trace";
  triggerType: "manual_poc";
  traceTimestamp: string;
  revision: string;
  executionId: string;
  resultVersion: 1 | 2;
  state: TopicSummaryState;
  summary: string;
  embedding: number[];
  inputHash: string;
  snapshotHash: string;
  invocationHash: string;
  summaryModel: string;
  embeddingModel: string;
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  summaryCostUsd: number;
  embeddingCostUsd: number;
  processedAt: string;
  metadata: Record<string, unknown>;
}
export interface TopicAssignment {
  id: string;
  executionId: string;
  coordinates: [number, number] | null;
  projectId: string;
  facetId: string;
  facetVersionId: string;
  facetVersion: number;
  traceId: string;
  unitType: "trace";
  traceTimestamp: string;
  summaryId: string;
  summaryRevision: string;
  runId: string | null;
  runSequence: string | null;
  topicId: string | null;
  topicVersionId: string | null;
  outcome: "assigned" | "outlier" | "not_applicable" | "insufficient_input";
  distance: number | null;
  runnerUpDistance: number | null;
  rejectionReason: string;
  origin: "initial" | "online" | "backfill";
  assignedAt: string;
}
export interface TopicDefinition {
  topicVersionId: string;
  projectId: string;
  topicId: string;
  runId: string;
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
  facetVersionId: string;
  runSequence: string;
  status: "pending" | "running" | "completed" | "failed";
  phase: string;
  publishedAt: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  config: Record<string, unknown>;
  summaryIds: string[];
  manifestPath: string;
  artifactPath: string;
  metrics: Record<string, unknown>;
  error: string | null;
  topics: TopicDefinition[];
}
export interface TopicFacetProgress {
  facetVersionId: string;
  outcome: TopicFacetOutcome;
  summaryIds: string[];
  runId: string | null;
  error: string | null;
  refresh?: {
    shouldRefresh: boolean;
    reasons: string[];
    metrics: Record<string, number>;
  };
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
  revision: string;
  input: TopicExecutionInput;
  status: TopicExecutionStatus;
  phase: string;
  createdAt: string;
  updatedAt: string;
  facets: TopicFacetProgress[];
  traceErrors: { traceId: string; error: string }[];
  error: string | null;
}
