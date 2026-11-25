import { z } from "zod";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import {
  getTopicSetupTraceNames,
  getTracingReadinessSettings,
} from "@langfuse/shared/src/server";
import {
  TOPICS_COST_ESTIMATE_MAX_FACETS,
  topicIdSchema,
  topicFacetRefSchema,
  topicRuleConfigSchema,
  topicTimeRangeSchema,
  topicsAutomaticProcessingSchema,
  topicsModelSettingsSchema,
  topicsSetupSchema,
  topicRuleFilterError,
  topicSnapshotSummarizeSchema,
  type TopicCostEstimate,
  type TopicExecutionSummary,
  type TopicFacetRef,
} from "@langfuse/shared/topics";
import {
  readTopicExecutionSummary,
  getTopicExecutionCosts,
  getTopicExecutionNamingCosts,
  getTopicRuleMapCosts,
  enqueueTopicSnapshotSetup,
  readTopicSnapshotSummarizing,
  writeTopicExecution,
  writeTopicSnapshotSummarizing,
  listTopicExecutions,
  listTopicFacets,
  getTopicFacetVersion,
  getLatestFacetSummaries,
  createTopicFacet,
  createTopicFacetVersion,
  getTopicRule,
  saveTopicRule,
  getTopicRun,
  readTopicMapAssignments,
  selectTopicMapMatches,
  readTopicsModelSettings,
  hasCurrentTopicEmbeddings,
  checkTopicsModelSettings,
  saveTopicsSetup,
  setTopicsAutomaticProcessing,
  setTopicRuleEnabled,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
  getEnabledTopicsModels,
  readTopicRuleSetup,
  startTopicRuleRefresh,
  startTopicRuleSetup,
  priceTopicCostEstimate,
  readTopicCostEstimate,
  startTopicCostEstimate,
  topicCostEstimateKey,
} from "@langfuse/shared/topics/server";
import {
  createTRPCRouter,
  protectedProjectProcedureWithoutTracing,
  type ProjectAuthedContext,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import { canViewTopics } from "@/src/features/topics/topicsAccess";
import { createsSummaries } from "../topic-run-labels";
import {
  previewTopicTraces,
  countTopicSetupTraces,
  topicTraceSelectionSchema,
} from "./traceSelection";

import {
  analysisTopicResults,
  currentTopicResults,
  listTopicTraces,
  traceFacetResults,
} from "./currentResults";
import {
  previewTopicAnalysis,
  startTopicAnalysis,
  topicMapsOverview,
} from "./slices";
import {
  topicFilterOptions,
  topicStripeMap,
  tracesTopics,
} from "./traceTopics";

const projectInput = z.object({ projectId: topicIdSchema });
const executionInput = projectInput.extend({ executionId: topicIdSchema });
const includeCosts = z.boolean().default(true);
// A history page plus the selected snapshot and an open run detail.
const visibleExecutionIds = z.array(topicIdSchema).max(102);
const mapInput = projectInput.extend({ runId: topicIdSchema });
// Snapshots offer 7 or 14 days; longer windows risk an out-of-memory fit.
const SNAPSHOT_MAX_WINDOW_MS = 14 * 86_400_000;
const analysisFilterInput = projectInput.extend({
  filter: topicRuleConfigSchema.shape.filter,
  timeRange: topicTimeRangeSchema.refine(
    ({ from, to }) => to.getTime() - from.getTime() <= SNAPSHOT_MAX_WINDOW_MS,
    "Select a time range of at most 14 days.",
  ),
  facets: z.array(topicFacetRefSchema).min(1),
});
/** Tracing filters on a trace, as a rule filter takes them. */
const traceFilterInput = topicRuleConfigSchema.shape.filter.refine(
  (filter) => !topicRuleFilterError(filter),
  { message: "These filters can't be used on Topics traces." },
);
const tracesInput = projectInput.extend({
  facetId: topicIdSchema,
  /** A rule's live map or an analysis snapshot; omitted means every rule. */
  ruleId: topicIdSchema.optional(),
  analysisId: topicIdSchema.optional(),
  topicIds: z
    .object({
      operator: z.enum(["any of", "none of"]),
      values: z.array(z.string()).max(1000),
    })
    .optional(),
  statuses: z
    .object({
      operator: z.enum(["any of", "none of"]),
      values: z.array(
        z.enum([
          "assigned",
          "outlier",
          "awaiting_map",
          "not_applicable",
          "insufficient_input",
        ]),
      ),
    })
    .optional(),
  assigned: z.boolean().optional(),
  traceId: z.string().min(1).optional(),
  filter: traceFilterInput.optional(),
  cursor: z
    .object({ timestamp: z.date(), traceId: z.string(), facetId: z.string() })
    .optional(),
});
const topicsProcedure = protectedProjectProcedureWithoutTracing
  .input(projectInput)
  .use(({ ctx, input, next }) => {
    if (!canViewTopics(ctx.session, input.projectId))
      throw new LangfuseNotFoundError("Topics is not available.");
    return next();
  });
const topicsWriteProcedure = topicsProcedure.use(({ ctx, input, next }) => {
  throwIfNoProjectAccess({
    session: ctx.session,
    projectId: input.projectId,
    scope: "topics:CUD",
  });
  return next();
});

const costEstimateInput = projectInput.extend({
  filter: topicRuleConfigSchema.shape.filter,
  facetIds: z.array(topicIdSchema).min(1).max(TOPICS_COST_ESTIMATE_MAX_FACETS),
});

/** The facets' current versions and the project's stored Topics models; null without a summary model. */
async function costEstimateInputs(
  input: z.infer<typeof costEstimateInput>,
): Promise<TopicCostEstimate["inputs"] | null> {
  const [models, facets] = await Promise.all([
    readTopicsModelSettings(input.projectId),
    listTopicFacets(input.projectId),
  ]);
  if (!models.summary) return null;
  return {
    filter: input.filter,
    facets: input.facetIds.map((facetId) => {
      const version = facets.find(({ id }) => id === facetId)?.versions[0];
      if (!version) throw new LangfuseNotFoundError("Question not found.");
      return { facetId, version: version.version };
    }),
    summaryModel: models.summary.model,
    embeddingModel: models.embedding?.model ?? null,
  };
}

function readTopicConfig(ctx: ProjectAuthedContext, projectId: string) {
  return ctx.prisma.topicConfig.findUnique({ where: { projectId } });
}

/** Saves the project's Topics config and records the change in the audit log. */
async function auditedTopicConfigSave<T>(
  ctx: ProjectAuthedContext,
  projectId: string,
  save: () => Promise<T>,
): Promise<T> {
  const before = await readTopicConfig(ctx, projectId);
  const result = await save();
  const after = await readTopicConfig(ctx, projectId);
  if (after)
    await auditLog({
      session: ctx.session,
      resourceType: "topicConfig",
      resourceId: after.id,
      action: before ? "update" : "create",
      before,
      after,
    });
  return result;
}

async function requireFacetVersions(
  projectId: string,
  facets: TopicFacetRef[],
) {
  for (const { facetId, version } of facets) {
    if (!(await getTopicFacetVersion(projectId, facetId, version)))
      throw new InvalidRequestError("Facet version not found in this project.");
  }
}

async function executionWithRecovery(projectId: string, executionId: string) {
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!execution) throw new LangfuseNotFoundError("Execution not found.");
  return recoverExecutionState(execution);
}

function canResume(execution: TopicExecutionSummary) {
  if (execution.input.operation === "process") return false;
  return (
    execution.status === "failed" ||
    (execution.status === "completed_with_errors" &&
      execution.facets.some(
        (facet) => facet.outcome === "pending" || facet.outcome === "failed",
      ))
  );
}

async function recoverExecutionState(execution: TopicExecutionSummary) {
  if (
    execution.status === "running" ||
    execution.status === "queued" ||
    canResume(execution)
  ) {
    const queueState = await getTopicExecutionQueueState(execution);
    if (
      [
        "active",
        "waiting",
        "delayed",
        "prioritized",
        "waiting-children",
      ].includes(queueState) &&
      canResume(execution)
    ) {
      return {
        ...execution,
        status:
          queueState === "active" ? ("running" as const) : ("queued" as const),
        phase: queueState === "active" ? "resuming" : "queued",
        error: null,
      };
    }
    if (
      (execution.status === "running" || execution.status === "queued") &&
      ["failed", "completed", "missing", "unknown"].includes(queueState)
    ) {
      return {
        ...execution,
        status: "failed" as const,
        phase: "interrupted",
        error:
          execution.input.operation === "process"
            ? "The worker stopped before this execution finished."
            : "The worker stopped before this execution finished. Resume its interrupted stages.",
      };
    }
  }
  return execution;
}

type TopicMap = {
  status: "ready" | "unavailable";
  reason: string | null;
  missingSummaryCount: number;
  points: {
    traceId: string;
    summary: string;
    unitStartTime: string;
    topicId: string | null;
    outcome: "assigned" | "outlier" | "unassigned";
    x: number;
    y: number;
  }[];
  unpositionedCount: number;
};
/** The run's own discovery cohort, independent of the page's time range. */
async function publishedTopicMap(input: {
  projectId: string;
  runId: string;
}): Promise<TopicMap> {
  const run = await getTopicRun(input.projectId, input.runId);
  if (!run || run.projectId !== input.projectId)
    throw new LangfuseNotFoundError("Map not found.");
  const unavailable: TopicMap = {
    status: "unavailable",
    reason: "This map has not been published.",
    missingSummaryCount: 0,
    points: [],
    unpositionedCount: 0,
  };
  if (run.status !== "completed") return unavailable;
  const cohortRange = topicTimeRangeSchema.safeParse(run.config.timeRange);
  if (!cohortRange.success)
    return { ...unavailable, reason: "This map has no saved cohort window." };
  const discoveryAssignments = (
    await readTopicMapAssignments(
      input.projectId,
      { facetId: run.facetId, version: run.facetVersion },
      run.id,
      cohortRange.data,
    )
  ).sort((a, b) => (a.traceId ?? "").localeCompare(b.traceId ?? ""));
  if (!discoveryAssignments.length)
    return {
      ...unavailable,
      reason: "The discovery cohort is unavailable for this map.",
    };
  if (
    discoveryAssignments.some(
      (row) =>
        row.projectId !== input.projectId ||
        row.runId !== run.id ||
        row.origin !== "initial" ||
        row.facetId !== run.facetId ||
        row.facetVersion !== run.facetVersion ||
        row.traceId === null ||
        row.coordinates?.length !== 2 ||
        !row.coordinates.every(Number.isFinite),
    )
  )
    return {
      ...unavailable,
      reason:
        "Saved coordinates are not fully available for the discovery cohort.",
    };

  const summaries = await getLatestFacetSummaries(
    input.projectId,
    run.facetId,
    run.facetVersion,
    cohortRange.data,
    discoveryAssignments.map((row) => row.traceId!),
  );
  const byTraceId = new Map(
    summaries
      .filter(
        (row) =>
          row.projectId === input.projectId &&
          row.facetId === run.facetId &&
          row.facetVersion === run.facetVersion &&
          row.traceId !== null,
      )
      .map((row) => [row.traceId, row]),
  );
  const topicIds = new Set(run.topics.map((topic) => topic.topicId));
  const points = discoveryAssignments.flatMap(
    (projected): TopicMap["points"] => {
      const row = byTraceId.get(projected.traceId!);
      if (!row || row.traceId === null) return [];
      const [x, y] = projected.coordinates!;
      const assignment =
        projected.topicId === null || topicIds.has(projected.topicId)
          ? projected
          : undefined;
      let outcome: TopicMap["points"][number]["outcome"] = "unassigned";
      if (assignment) outcome = assignment.topicId ? "assigned" : "outlier";
      return [
        {
          traceId: row.traceId,
          summary: row.summary,
          unitStartTime: row.unitStartTime,
          topicId: assignment?.topicId ?? null,
          outcome,
          x,
          y,
        },
      ];
    },
  );
  return {
    status: "ready",
    reason: null,
    missingSummaryCount: discoveryAssignments.length - points.length,
    points,
    unpositionedCount: byTraceId.size - points.length,
  };
}

/** Same cohort and window as publishedTopicMap; an unpublished map matches nothing. */
async function topicMapMatches(
  input: {
    projectId: string;
    runId: string;
    filter: z.infer<typeof traceFilterInput>;
  },
  prisma: ProjectAuthedContext["prisma"],
) {
  const run = await getTopicRun(input.projectId, input.runId);
  if (!run || run.projectId !== input.projectId)
    throw new LangfuseNotFoundError("Map not found.");
  const cohortRange = topicTimeRangeSchema.safeParse(run.config.timeRange);
  if (run.status !== "completed" || !cohortRange.success)
    return { traceIds: [] };
  return {
    traceIds: await selectTopicMapMatches(
      {
        projectId: input.projectId,
        runId: run.id,
        facet: { facetId: run.facetId, version: run.facetVersion },
        timeRange: cohortRange.data,
        filter: input.filter,
      },
      prisma,
    ),
  };
}

export const topicsRouter = createTRPCRouter({
  /** Counts per facet over its published map's window; the page has no time filter. */
  currentResults: topicsProcedure
    .input(projectInput.extend({ ruleId: topicIdSchema.optional() }))
    .query(({ input }) =>
      currentTopicResults(input.projectId, undefined, {
        ruleId: input.ruleId,
      }),
    ),
  /** One page of a facet's traces; filters and paging run in ClickHouse. */
  traces: topicsProcedure
    .input(tracesInput)
    .query(({ input }) => listTopicTraces(input)),
  /** Tracing table column: current topics for the visible page, loaded after the rows. */
  forTraces: topicsProcedure
    .input(
      projectInput.extend({
        traces: z
          .array(z.object({ traceId: z.string().min(1), timestamp: z.date() }))
          .min(1)
          .max(500),
      }),
    )
    .query(({ input }) => tracesTopics(input.projectId, input.traces)),
  filterOptions: topicsProcedure.query(({ input }) =>
    topicFilterOptions(input.projectId),
  ),
  /** Tracing topic stripe: the facet's default map and its topics in the Topics page ranking. */
  stripeMap: topicsProcedure
    .input(projectInput.extend({ facet: z.string().min(1).max(200) }))
    .query(({ input }) => topicStripeMap(input.projectId, input.facet)),
  /** Rule maps and one-off analyses for the map picker and the Rules page. */
  maps: topicsProcedure.query(({ input }) =>
    topicMapsOverview(input.projectId),
  ),
  analysisResults: topicsProcedure
    .input(executionInput)
    .query(({ input }) =>
      analysisTopicResults(input.projectId, input.executionId),
    ),
  previewAnalysis: topicsProcedure
    .input(analysisFilterInput)
    .query(async ({ input }) => {
      await requireFacetVersions(input.projectId, input.facets);
      return previewTopicAnalysis(input);
    }),
  startAnalysis: topicsWriteProcedure
    .input(
      analysisFilterInput.extend({
        label: z.string().trim().min(1).max(100),
        summarize: topicSnapshotSummarizeSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Snapshots accept only filters a map could save.
      const filterError = topicRuleFilterError(input.filter);
      if (filterError) throw new InvalidRequestError(filterError);
      await requireFacetVersions(input.projectId, input.facets);
      return startTopicAnalysis(input, ctx.session.user.id);
    }),
  /** Trace header: every facet result of one trace, with its summary. */
  forTrace: topicsProcedure
    .input(
      projectInput.extend({ traceId: z.string().min(1), timestamp: z.date() }),
    )
    .query(({ input }) =>
      traceFacetResults(input.projectId, input.traceId, input.timestamp),
    ),
  previewTraces: topicsProcedure
    .input(topicTraceSelectionSchema)
    .query(({ input, ctx }) => previewTopicTraces(input, ctx.prisma)),
  facets: topicsProcedure.query(({ input }) =>
    listTopicFacets(input.projectId),
  ),
  saveFacet: topicsWriteProcedure
    .input(
      projectInput.extend({
        facetId: topicIdSchema.optional(),
        name: z.string().trim().min(1).max(100),
        description: z.string().max(500).default(""),
        prompt: z.string().trim().min(10).max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.facetId)
        return createTopicFacetVersion({ ...input, facetId: input.facetId });
      return createTopicFacet(input);
    }),
  saveRule: topicsWriteProcedure
    .input(
      topicRuleConfigSchema.extend({
        projectId: topicIdSchema,
        id: topicIdSchema.optional(),
        name: z.string().trim().min(1).max(100),
        facetIds: z.array(topicIdSchema).min(1),
        sampling: z.number().gt(0).max(1).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const filterError = topicRuleFilterError(input.filter);
      if (filterError) throw new InvalidRequestError(filterError);
      const before = input.id
        ? await getTopicRule(input.projectId, input.id)
        : null;
      const rule = await saveTopicRule({
        ...input,
        userId: ctx.session.user.id,
      });
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: rule.id,
        action: input.id ? "update" : "create",
        ...(before ? { before } : {}),
        after: rule,
      });
      return rule;
    }),
  setRuleEnabled: topicsWriteProcedure
    .input(projectInput.extend({ id: topicIdSchema, enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const before = await getTopicRule(input.projectId, input.id);
      const rule = await setTopicRuleEnabled(
        input.projectId,
        input.id,
        input.enabled,
      );
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: rule.id,
        action: "update",
        before,
        after: rule,
      });
      return rule;
    }),
  modelSettings: topicsProcedure.query(({ input }) =>
    readTopicsModelSettings(input.projectId),
  ),
  hasCurrentEmbeddings: topicsProcedure.query(({ input }) =>
    hasCurrentTopicEmbeddings(input.projectId),
  ),
  tracingReadinessSettings: topicsProcedure.query(({ input }) =>
    getTracingReadinessSettings(input.projectId),
  ),
  testModelSettings: topicsWriteProcedure
    .input(topicsModelSettingsSchema.extend({ projectId: topicIdSchema }))
    .mutation(({ input: { projectId, ...settings } }) =>
      checkTopicsModelSettings(projectId, settings),
    ),
  saveSetup: topicsWriteProcedure
    .input(topicsSetupSchema.extend({ projectId: topicIdSchema }))
    .mutation(async ({ input: { projectId, ...setup }, ctx }) => {
      const rule = await auditedTopicConfigSave(ctx, projectId, () =>
        saveTopicsSetup(projectId, setup, ctx.session.user.id),
      );
      if (rule)
        await auditLog({
          session: ctx.session,
          resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
          resourceId: rule.id,
          action: setup.ruleId ? "update" : "create",
          after: rule,
        });
      return rule;
    }),
  setAutomaticProcessing: topicsWriteProcedure
    .input(topicsAutomaticProcessingSchema.extend({ projectId: topicIdSchema }))
    .mutation(async ({ input: { projectId, ...input }, ctx }) => {
      const { ruleBefore, ruleAfter } = await auditedTopicConfigSave(
        ctx,
        projectId,
        () =>
          setTopicsAutomaticProcessing(projectId, input, ctx.session.user.id),
      );
      if (ruleBefore && ruleAfter && ruleBefore.sampling !== ruleAfter.sampling)
        await auditLog({
          session: ctx.session,
          resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
          resourceId: ruleAfter.id,
          action: "update",
          before: ruleBefore,
          after: ruleAfter,
        });
      return { enabled: input.enabled, sampling: ruleAfter?.sampling ?? null };
    }),
  executions: topicsProcedure
    .input(projectInput.extend({ includeCosts }))
    .query(async ({ input }) => {
      const listed = await listTopicExecutions(input.projectId);
      const [executions, costs] = await Promise.all([
        Promise.all(listed.map(recoverExecutionState)),
        input.includeCosts
          ? getTopicExecutionCosts(
              input.projectId,
              listed
                .filter((execution) => createsSummaries(execution.input))
                .map((execution) => execution.id),
            )
          : null,
      ]);
      return executions.map((execution) => ({
        ...execution,
        estimatedCost: costs?.[execution.id] ?? null,
      }));
    }),
  execution: topicsProcedure
    .input(executionInput.extend({ includeCosts }))
    .query(async ({ input }) => {
      const execution = await executionWithRecovery(
        input.projectId,
        input.executionId,
      );
      const costs =
        input.includeCosts && createsSummaries(execution.input)
          ? await getTopicExecutionCosts(input.projectId, [execution.id])
          : null;
      return { ...execution, estimatedCost: costs?.[execution.id] ?? null };
    }),
  executionCosts: topicsProcedure
    .input(projectInput.extend({ executionIds: visibleExecutionIds }))
    .query(({ input }) =>
      getTopicExecutionCosts(input.projectId, input.executionIds),
    ),
  executionCostBreakdown: topicsProcedure
    .input(
      projectInput.extend({
        executionIds: visibleExecutionIds,
        includeSummaryCosts: z.boolean().default(true),
      }),
    )
    .query(
      async ({ input: { projectId, executionIds, includeSummaryCosts } }) => {
        const [costs, naming] = await Promise.all([
          includeSummaryCosts
            ? getTopicExecutionCosts(projectId, executionIds)
            : null,
          getTopicExecutionNamingCosts(projectId, executionIds),
        ]);
        return Object.fromEntries(
          executionIds.map(
            (id) =>
              [
                id,
                {
                  summaries:
                    costs && Object.hasOwn(costs, id) ? costs[id] : null,
                  naming: Object.hasOwn(naming, id) ? naming[id] : null,
                },
              ] as const,
          ),
        );
      },
    ),
  setupTraceCounts: topicsProcedure
    .input(
      projectInput.extend({
        // Counts the stored rule's filter too, which saveRule validates less strictly.
        filter: topicRuleConfigSchema.shape.filter.default([]),
      }),
    )
    .query(({ input }) =>
      countTopicSetupTraces({
        projectId: input.projectId,
        filter: input.filter,
        now: new Date(),
      }),
    ),
  /** Measures a sample of matching traces in the background; no model is called. */
  startCostEstimate: topicsWriteProcedure
    .input(costEstimateInput)
    .mutation(async ({ input }) => {
      const inputs = await costEstimateInputs(input);
      if (!inputs) throw new InvalidRequestError("Pick a summary model first.");
      const estimate = await startTopicCostEstimate({
        projectId: input.projectId,
        ...inputs,
      });
      return { key: estimate.key };
    }),
  /** The estimate for these inputs, priced with current model prices; null before one starts. */
  costEstimate: topicsWriteProcedure
    .input(costEstimateInput)
    .query(async ({ input }) => {
      const inputs = await costEstimateInputs(input);
      if (!inputs) return null;
      const estimate = await readTopicCostEstimate(
        input.projectId,
        topicCostEstimateKey(inputs),
      );
      if (!estimate) return null;
      return {
        ...estimate,
        prices: await priceTopicCostEstimate(input.projectId, estimate),
      };
    }),
  setupTraceNames: topicsProcedure.query(({ input }) =>
    getTopicSetupTraceNames({ projectId: input.projectId, now: new Date() }),
  ),
  /**
   * Builds a rule's first map: reuses summaries, seeds the shortfall, then fits.
   * Null when the rule is paused or automatic processing is off.
   */
  startRuleSetup: topicsWriteProcedure
    .input(projectInput.extend({ ruleId: topicIdSchema }))
    .mutation(async ({ input }) => {
      const rule = await getTopicRule(input.projectId, input.ruleId);
      if (!rule) throw new LangfuseNotFoundError("Topic rule not found.");
      const processing = await getEnabledTopicsModels([input.projectId]);
      if (rule.enabled === false || !processing.has(input.projectId))
        return null;
      return startTopicRuleSetup(input.projectId, input.ruleId);
    }),
  /** Refits the rule's map now; the maps overview reports its progress and cooldown. */
  refreshRuleMap: topicsWriteProcedure
    .input(projectInput.extend({ ruleId: topicIdSchema }))
    .mutation(({ input }) =>
      startTopicRuleRefresh({
        projectId: input.projectId,
        ruleId: input.ruleId,
      }),
    ),
  ruleMapCosts: topicsProcedure.query(({ input }) =>
    getTopicRuleMapCosts(input.projectId),
  ),
  ruleSetupStatus: topicsProcedure
    .input(projectInput.extend({ ruleId: topicIdSchema }))
    .query(({ input }) => readTopicRuleSetup(input.projectId, input.ruleId)),
  retry: topicsWriteProcedure
    .input(executionInput)
    .mutation(async ({ input }) => {
      const execution = await executionWithRecovery(
        input.projectId,
        input.executionId,
      );
      if (execution.input.operation === "process")
        throw new InvalidRequestError(
          "Manual runs can no longer be resumed. Start a snapshot instead.",
        );
      if (!canResume(execution))
        throw new InvalidRequestError(
          "Only failed or interrupted executions can be resumed.",
        );
      // A snapshot that never seeded its traces summarizes first, through its setup.
      const summarizing =
        execution.input.operation === "update" &&
        execution.input.analysis?.summarize
          ? await readTopicSnapshotSummarizing(input.projectId, execution.id)
          : undefined;
      if (summarizing !== undefined && !summarizing?.traceIds) {
        if (summarizing)
          await writeTopicSnapshotSummarizing(input.projectId, execution.id, {
            ...summarizing,
            failedTicks: 0,
          });
        await writeTopicExecution({
          ...execution,
          status: "queued",
          phase: "summarizing",
          error: null,
        });
        await enqueueTopicSnapshotSetup(input.projectId, execution.id);
        return;
      }
      await enqueueTopicExecution(input.projectId, execution.id);
    }),
  map: topicsProcedure
    .input(mapInput)
    .query(({ input }) => publishedTopicMap(input)),
  /** The map's points whose traces meet the tracing filters, for the map highlight. */
  mapMatches: topicsProcedure
    .input(mapInput.extend({ filter: traceFilterInput }))
    .query(({ input, ctx }) => topicMapMatches(input, ctx.prisma)),
});
