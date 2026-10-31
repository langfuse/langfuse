import { z } from "zod";
import { singleFilterList } from "../interfaces/filters";
import { DEFAULT_TOPIC_FACETS } from "./default-facets";

export { DEFAULT_TOPIC_FACETS };

export const TOPICS_BEDROCK_ACCESS_ERROR =
  "Unable to invoke LLM model (HTTP 403), please contact Langfuse Support";

export const topicIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const topicTraceIdSchema = z.string().min(1).max(1000);
/** The longest time range any Topics read or update accepts. */
export const TOPICS_MAX_TIME_RANGE_MS = 93 * 86_400_000;
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

export const TOPICS_MODEL_SLOTS = [
  "summary",
  "embedding",
  "clustering",
] as const;
export type TopicsModelSlotName = (typeof TOPICS_MODEL_SLOTS)[number];
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
  clustering: {
    label: "Topic clustering",
    recommendation:
      "Names and describes each topic when topics are updated. Use a stronger model such as GPT-5.6 Terra, or Claude Sonnet through Amazon Bedrock.",
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
  clustering: topicsModelSlotSchema.nullable(),
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
  .refine(
    ({ from, to }) => to.getTime() - from.getTime() <= TOPICS_MAX_TIME_RANGE_MS,
    {
      message: "Select at most 93 days of traces.",
      path: ["from"],
    },
  );
export const topicTraceSelectionSnapshotSchema =
  topicTraceSelectionCriteriaSchema.safeExtend({
    excludedTraceIds: z.array(topicTraceIdSchema).default([]),
  });
export const topicRuleSettingsSchema = topicRuleConfigSchema.extend({
  sampling: z.number().min(0).max(1).default(1),
});

/** A project runs at most this many continuous Topics rules. */
export const TOPICS_MAX_RULES = 5;
/** Largest random cohort a one-off analysis or past-trace processing run selects. */
export const TOPICS_SLICE_MAX_TRACES = 20_000;
/** An analysis needs this many summarized traces before it can cluster. */
export const TOPICS_ANALYSIS_MIN_TRACES = 100;
export const TOPICS_REFIT_INTERVAL_HOURS = [6, 12, 24] as const;
export type TopicsRefitIntervalHours =
  (typeof TOPICS_REFIT_INTERVAL_HOURS)[number];

/**
 * Columns the online matcher can evaluate on a finished trace's observations.
 * A trace matches a rule when one of its observations meets every filter.
 */
export const TOPICS_RULE_FILTER_COLUMNS = [
  "environment",
  "traceName",
  "name",
  "type",
  "level",
  "metadata",
  "statusMessage",
  "sessionId",
  "parentObservationId",
  "calledToolNames",
  "toolCalls",
] as const;
const negativeOperators = new Set([
  "none of",
  "does not contain",
  "is not set",
  "<>",
  "is null",
]);
export const TOPICS_RULE_FILTER_ERROR =
  "Scores, cost, latency, tags, users, versions, releases, models, prompts, experiments, 'is not' and topics can't be used in rules. Use an analysis for those.";
/** Rules match during ingestion, so they only take positive filters on matcher columns. */
export function topicRuleFilterError(
  filter: z.infer<typeof singleFilterList>,
): string | null {
  const unsupported = filter.some(
    (item) =>
      !(TOPICS_RULE_FILTER_COLUMNS as readonly string[]).includes(
        item.column,
      ) || negativeOperators.has(item.operator),
  );
  return unsupported ? TOPICS_RULE_FILTER_ERROR : null;
}

/** Saved with a one-off clustering run; the cohort resolves from it at fit time. */
export const topicAnalysisConfigSchema = z.object({
  label: z.string().trim().min(1).max(100),
  filter: topicRuleConfigSchema.shape.filter,
  // The narrowest rule whose filters the analysis filters contain, if any.
  parentRuleId: topicIdSchema.nullable().default(null),
  // The analysis this one reruns on a new window.
  previousExecutionId: topicIdSchema.nullable().default(null),
  seed: z.string().min(1).max(128),
});
export type TopicAnalysisConfig = z.infer<typeof topicAnalysisConfigSchema>;

export const topicsSetupSchema = topicsModelSettingsSchema.extend({
  traceIdleMs: z
    .number()
    .int()
    .multipleOf(1000, "Use whole seconds for the idle time.")
    .min(60_000, "Wait at least 60 seconds.")
    .max(3_600_000, "Wait at most 3,600 seconds."),
  // The rule whose facets (and filter) this save writes. Without it, rule fields
  // are only accepted while the project has no rule yet; otherwise omit them.
  ruleId: topicIdSchema.optional(),
  facets: z
    .array(
      z.object({
        name: z.string(),
        enabled: z.boolean(),
      }),
    )
    .superRefine((facets, ctx) => {
      const expected = DEFAULT_TOPIC_FACETS.map((facet) => facet.name);
      const names = facets.map((facet) => facet.name);
      if (
        names.length !== expected.length ||
        new Set(names).size !== names.length ||
        expected.some((name) => !names.includes(name))
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Include each built-in facet once.",
        });
      }
      if (!facets.some((facet) => facet.enabled)) {
        ctx.addIssue({
          code: "custom",
          message: "Turn on at least one facet.",
        });
      }
    })
    .optional(),
  // Enabled custom facets keep their rule assignment; they are edited elsewhere.
  customFacetIds: z.array(topicIdSchema).optional(),
  // Omit to keep the rule's stored filter; a new rule defaults to all traces.
  filter: topicRuleConfigSchema.shape.filter.optional(),
});
export type TopicsSetup = z.infer<typeof topicsSetupSchema>;

/**
 * Turns automatic processing of new traces on or off. Sampling applies only to
 * automatic processing and is written to `ruleId`; omit both to keep every
 * rule's stored rate.
 */
export const topicsAutomaticProcessingSchema = z.object({
  enabled: z.boolean(),
  ruleId: topicIdSchema.optional(),
  sampling: z.number().min(0).max(1).optional(),
});
export type TopicsAutomaticProcessing = z.infer<
  typeof topicsAutomaticProcessingSchema
>;

export type TopicRule = z.infer<typeof topicRuleSettingsSchema> & {
  id: string;
  projectId: string;
  name: string;
  facetIds: string[];
  updatedAt: string;
  enabled?: boolean;
  createdAt?: string;
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
      // Generate topics over this range once every batch has finished.
      thenUpdate: z
        .object({
          timeRange: topicTimeRangeSchema.refine(
            ({ from, to }) => to.getTime() - from.getTime() <= 93 * 86_400_000,
            "Select a time range of at most 93 days.",
          ),
          ruleId: topicIdSchema.optional(),
        })
        .optional(),
    })
    .strict(),
  z
    .object({
      ...executionBase,
      operation: z.literal("update"),
      timeRange: topicTimeRangeSchema,
      exploratory: z.boolean().default(false),
      minimumTraceCount: topicMinimumTraceCountSchema.optional(),
      // Refit of one rule's maps over the rule's cohort in the window.
      ruleId: topicIdSchema.optional(),
      // One-off clustering of a filtered slice; never serves online assignment.
      analysis: topicAnalysisConfigSchema.optional(),
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
  /** Processing path that wrote the row; rows from before the automatic/manual split hold "manual_poc". */
  triggerType: "automatic" | "manual" | "manual_poc";
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
  /** Rule the assignment serves; null for analysis rows and rows written before rules. */
  ruleId?: string | null;
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
  /** Rule whose continuous map this is; null for analyses and pre-rule runs. */
  ruleId?: string | null;
  /** Analysis execution this one-off map belongs to. */
  batchActionId?: string | null;
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
