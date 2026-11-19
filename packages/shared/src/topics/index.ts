import { z } from "zod";
import { singleFilterList } from "../interfaces/filters";
import { TopicsTargetObject } from "../features/evals/types";
import { validateEvaluatorFiltersForTarget } from "../features/evals/validateEvaluatorFilters";
import { DEFAULT_TOPIC_FACETS } from "./default-facets";

export { DEFAULT_TOPIC_FACETS };

/** Tracing filter column: key is the facet name, values are topic names. */
const TOPIC_FILTER_COLUMN = "topics";

export function isTopicFilter<T extends { type: string; column: string }>(
  filter: T,
): filter is Extract<T, { type: "categoryOptions" }> {
  return (
    filter.type === "categoryOptions" && filter.column === TOPIC_FILTER_COLUMN
  );
}

/** Batch jobs read without topic membership, so they must not drop a topic filter silently. */
export const TOPIC_FILTERS_IN_BATCH_JOBS_MESSAGE =
  "Topic filters can't be used for batch exports or actions yet. Remove the topic filter and try again.";

export const topicIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
/** The longest time range any Topics read or update accepts. */
export const TOPICS_MAX_TIME_RANGE_MS = 93 * 86_400_000;
/** One-off runs select traces from at most 30 days; larger windows get slow on high-volume projects. */
export const TOPICS_MAX_SELECTION_RANGE_MS = 30 * 86_400_000;
/** How long a live map waits after a manual refresh before the next one may start. */
export const TOPIC_RULE_REFRESH_COOLDOWN_MS = 15 * 60_000;
export const topicTimeRangeSchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine(({ from, to }) => from < to, {
    message: "Choose an end time after the start time.",
    path: ["to"],
  });
export type TopicTimeRange = z.infer<typeof topicTimeRangeSchema>;
export const TOPICS_MIN_EMBEDDING_DIMENSIONS = 64;
/** Every stored summary keeps a vector of this size, so larger ones grow the embeddings table too much. */
export const TOPICS_MAX_EMBEDDING_DIMENSIONS = 2048;
export const topicEmbeddingConfigSchema = z.object({
  embeddingModel: z.string().trim().min(1).optional(),
  embeddingDimensions: z
    .number()
    .int("Embedding dimensions must be a whole number.")
    .min(
      TOPICS_MIN_EMBEDDING_DIMENSIONS,
      `Use at least ${TOPICS_MIN_EMBEDDING_DIMENSIONS} embedding dimensions.`,
    )
    .max(
      TOPICS_MAX_EMBEDDING_DIMENSIONS,
      `Use at most ${TOPICS_MAX_EMBEDDING_DIMENSIONS.toLocaleString("en-US")} embedding dimensions.`,
    )
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
// Like evals: the provider name picks the project's connection, else its organization's.
const topicsModelSlotSchema = z.object({
  provider: z.string().min(1),
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
    ({ from, to }) =>
      to.getTime() - from.getTime() <= TOPICS_MAX_SELECTION_RANGE_MS,
    {
      message: "Select at most 30 days of traces.",
      path: ["from"],
    },
  );
export const topicRuleSettingsSchema = topicRuleConfigSchema.extend({
  sampling: z.number().min(0).max(1).default(1),
});

/** A project runs at most this many continuous Topics rules. */
export const TOPICS_MAX_RULES = 5;
/** Name of the map the first Topics setup creates. */
export const DEFAULT_TOPIC_RULE_NAME = "Default";
/** Largest random cohort a one-off analysis selects. */
export const TOPICS_SLICE_MAX_TRACES = 20_000;
/** An analysis needs this many summarized traces before it can cluster. */
export const TOPICS_ANALYSIS_MIN_TRACES = 100;
/** Fewer than TOPICS_ANALYSIS_MIN_TRACES, down to this, cluster in small-sample mode. */
export const TOPICS_ANALYSIS_SMALL_SAMPLE_MIN_TRACES = 10;
/** Seeds an analysis's sample, so its preview counts the traces its run clusters. */
export const TOPICS_ANALYSIS_SAMPLING_SEED = "topics-analysis";

export const TOPICS_RULE_FILTER_HINT =
  "Topics matches new traces at ingestion, so filters take trace, session, user, tags, metadata, observation and experiment fields with positive operators. Scores, cost, latency and 'is not' filters aren't supported.";
/** Rules use the trace-transcript filter definition ingestion matches them against. */
export function topicRuleFilterError(
  filter: z.infer<typeof singleFilterList>,
): string | null {
  const { issues } = validateEvaluatorFiltersForTarget({
    targetObject: TopicsTargetObject,
    filter,
  });
  return issues[0]?.message ?? null;
}

/** Saved with a one-off clustering run; the cohort resolves from it at fit time. */
/** Most traces a snapshot summarizes before it groups. */
export const TOPICS_SNAPSHOT_SUMMARIZE_MAX_TRACES = 1_000;
export const topicSnapshotSummarizeSchema = z.object({
  limit: z.number().int().min(1).max(TOPICS_SNAPSHOT_SUMMARIZE_MAX_TRACES),
  selection: z.enum(["random", "latest"]),
});
export type TopicSnapshotSummarize = z.infer<
  typeof topicSnapshotSummarizeSchema
>;
export const topicAnalysisConfigSchema = z.object({
  label: z.string().trim().min(1).max(100),
  filter: topicRuleConfigSchema.shape.filter,
  seed: z.string().min(1).max(128),
  // Traces without summaries to summarize through events-dispatch before grouping.
  summarize: topicSnapshotSummarizeSchema.optional(),
});
export type TopicAnalysisConfig = z.infer<typeof topicAnalysisConfigSchema>;

export const topicsSetupSchema = topicsModelSettingsSchema.extend({
  traceIdleMs: z
    .number()
    .int()
    .multipleOf(1000, "Use whole seconds for the idle time.")
    .min(60_000, "Wait at least 60 seconds.")
    .max(3_600_000, "Wait at most 3,600 seconds."),
  // The rule whose facets (and filter) this save writes; without it, rule fields create a rule.
  ruleId: topicIdSchema.optional(),
  /** Name of a rule this save creates; ignored when `ruleId` names one. */
  name: z.string().trim().max(100).optional(),
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
  // Omitted by Configure Topics, so the rule keeps the filter chosen in setup.
  filter: topicRuleConfigSchema.shape.filter
    .superRefine((filter, ctx) => {
      const error = topicRuleFilterError(filter);
      if (error) ctx.addIssue({ code: "custom", message: error });
    })
    .optional(),
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
export const topicExecutionInputSchema = z
  .object({
    ...executionBase,
    operation: z.literal("update"),
    timeRange: topicTimeRangeSchema,
    exploratory: z.boolean().default(false),
    minimumTraceCount: topicMinimumTraceCountSchema.optional(),
    // One-off clustering of a filtered slice; never serves online assignment.
    analysis: topicAnalysisConfigSchema.optional(),
  })
  .strict();
export type TopicExecutionInput = z.infer<typeof topicExecutionInputSchema>;
/** Settings of a stored manual run, read for History only. */
export type TopicManualRunInput = {
  operation: "process";
  projectId: string;
  requestId: string;
  facets: TopicFacetRef[];
  embeddingConfig: TopicEmbeddingConfig;
  thenUpdate?: { timeRange: { from: string; to: string } };
};
export type TopicOperation = TopicExecutionSummary["input"]["operation"];
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
  /** Rule of a continuous map; null for one-off snapshots and runs written before rules. */
  ruleId?: string | null;
  /** Execution of a one-off snapshot; null for continuous maps. */
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
  error: string | null;
}

export type TopicExecutionSummary = Omit<TopicExecution, "input"> & {
  input: TopicManualRunInput | TopicExecutionInput;
};
