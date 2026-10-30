import { z } from "zod";
import { createHash } from "node:crypto";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import {
  getTopicSetupTraceCounts,
  getTracingReadinessSettings,
} from "@langfuse/shared/src/server";
import {
  topicEmbeddingConfigSchema,
  topicExecutionInputSchema,
  topicIdSchema,
  topicFacetRefSchema,
  topicProcessingConfigSchema,
  topicRuleConfigSchema,
  topicTimeRangeSchema,
  topicsAutomaticProcessingSchema,
  TOPICS_MAX_TIME_RANGE_MS,
  topicsModelSettingsSchema,
  topicsSetupSchema,
  type TopicTimeRange,
  type TopicExecutionSummary,
  type TopicFacetRef,
} from "@langfuse/shared/topics";
import {
  createTopicExecution,
  readTopicExecutionForRequest,
  readTopicExecutionSummary,
  readTopicExecutionTraceErrors,
  getTopicExecutionCosts,
  getTopicSummaryCounts,
  listTopicExecutions,
  listTopicFacets,
  isTopicsProjectEnabled,
  getTopicFacetVersion,
  getLatestFacetSummaries,
  createTopicFacet,
  createTopicFacetVersion,
  listTopicRules,
  getTopicRule,
  saveTopicRule,
  getTopicRun,
  readTopicMapAssignments,
  getTopicsModels,
  readTopicsModelSettings,
  checkTopicsModelSettings,
  saveTopicsSetup,
  setTopicsAutomaticProcessing,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
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
import {
  previewTopicTraces,
  resolveTopicTraceSelection,
  selectTopicSetupTraces,
  topicSetupIdleMs,
  topicTraceSelectionSchema,
  topicTriggerInputSchema,
} from "./traceSelection";

import { currentTopicResults, traceFacetResults } from "./currentResults";
import { TOPIC_SETUP_BACKFILL_LIMIT } from "../topic-setup-flow";

const projectInput = z.object({ projectId: topicIdSchema });
// Covers the gap between a trace's first and last event (p99 is about 4 minutes).
const SETUP_TRACE_SPAN_MARGIN_MS = 5 * 60_000;
const executionInput = projectInput.extend({ executionId: topicIdSchema });
const resultInput = projectInput.extend({
  timeRange: topicTimeRangeSchema.refine(
    ({ from, to }) => to.getTime() - from.getTime() <= TOPICS_MAX_TIME_RANGE_MS,
    "Select a time range of at most 93 days.",
  ),
});
const mapInput = resultInput.extend({ runId: topicIdSchema });
const topicsProcedure = protectedProjectProcedureWithoutTracing
  .input(projectInput)
  .use(({ ctx, input, next }) => {
    // The allowlist comes from env here, so admins outside the project are covered too.
    const project = {
      id: input.projectId,
      topicsEnabled: isTopicsProjectEnabled(input.projectId),
    };
    if (!canViewTopics(ctx.session, project))
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

async function requireTopicsModels(projectId: string) {
  const models = await getTopicsModels(projectId);
  if (!models)
    throw new InvalidRequestError(
      "Choose summary, embedding, and clustering models in the Topics model settings first.",
    );
  return models;
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
          "The worker stopped before this execution finished. Resume its interrupted stages.",
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
    topicId: string | null;
    outcome: "assigned" | "outlier" | "unassigned";
    x: number;
    y: number;
  }[];
  unpositionedCount: number;
};
async function publishedTopicMap(input: {
  projectId: string;
  runId: string;
  timeRange: TopicTimeRange;
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
  const discoveryAssignments = (
    await readTopicMapAssignments(
      input.projectId,
      { facetId: run.facetId, version: run.facetVersion },
      run.id,
      input.timeRange,
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
    input.timeRange,
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

export const topicsRouter = createTRPCRouter({
  currentResults: topicsProcedure
    .input(resultInput)
    .query(({ input }) =>
      currentTopicResults(input.projectId, input.timeRange),
    ),
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
  rules: topicsProcedure.query(({ input }) => listTopicRules(input.projectId)),
  saveRule: topicsWriteProcedure
    .input(
      topicRuleConfigSchema.extend({
        projectId: topicIdSchema,
        id: topicIdSchema.optional(),
        name: z.string().trim().min(1).max(100),
        facetIds: z.array(topicIdSchema).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const rule = await saveTopicRule({
        ...input,
        userId: ctx.session.user.id,
      });
      await auditLog({
        session: ctx.session,
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: rule.id,
        action: input.id ? "update" : "create",
        after: rule,
      });
      return rule;
    }),
  modelSettings: topicsProcedure.query(({ input }) =>
    readTopicsModelSettings(input.projectId),
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
      if (ruleBefore.sampling !== ruleAfter.sampling)
        await auditLog({
          session: ctx.session,
          resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
          resourceId: ruleAfter.id,
          action: "update",
          before: ruleBefore,
          after: ruleAfter,
        });
      return { enabled: input.enabled, sampling: ruleAfter.sampling };
    }),
  summaryCounts: topicsProcedure
    .input(
      resultInput.extend({
        facets: z.array(topicFacetRefSchema).min(1),
      }),
    )
    .query(async ({ input }) => {
      await requireFacetVersions(input.projectId, input.facets);
      const { embedding } = await requireTopicsModels(input.projectId);
      return getTopicSummaryCounts(
        input.projectId,
        input.facets,
        topicEmbeddingConfigSchema.parse({
          embeddingModel: embedding.model,
          embeddingDimensions: embedding.dimensions,
        }),
        input.timeRange,
      );
    }),
  executions: topicsProcedure.query(async ({ input }) => {
    const executions = await Promise.all(
      (await listTopicExecutions(input.projectId)).map(recoverExecutionState),
    );
    const costs = await getTopicExecutionCosts(
      input.projectId,
      executions
        .filter((execution) => execution.input.operation === "process")
        .map((execution) => execution.id),
    );
    return executions.map((execution) => ({
      ...execution,
      estimatedCost: costs[execution.id] ?? null,
    }));
  }),
  execution: topicsProcedure.input(executionInput).query(async ({ input }) => {
    const execution = await executionWithRecovery(
      input.projectId,
      input.executionId,
    );
    const costs = await getTopicExecutionCosts(
      input.projectId,
      execution.input.operation === "process" ? [execution.id] : [],
    );
    return { ...execution, estimatedCost: costs[execution.id] ?? null };
  }),
  traceErrors: topicsProcedure
    .input(executionInput)
    .query(async ({ input }) => {
      const execution = await readTopicExecutionSummary(
        input.projectId,
        input.executionId,
      );
      if (!execution) throw new LangfuseNotFoundError("Execution not found.");
      return readTopicExecutionTraceErrors(execution);
    }),
  setupTraceCounts: topicsProcedure.query(async ({ input }) =>
    getTopicSetupTraceCounts({
      projectId: input.projectId,
      idleMs: await topicSetupIdleMs(input.projectId),
      now: new Date(),
    }),
  ),
  /** Summarizes recent finished traces, then generates topics over the same window. */
  startSetup: topicsWriteProcedure
    .input(
      projectInput.extend({
        requestId: topicIdSchema,
        sampling: z.number().gt(0).max(1),
        facets: z.array(topicFacetRefSchema).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { summary, embedding } = await requireTopicsModels(input.projectId);
      // Hash only the caller's input: a retry must find this run, not re-select traces.
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            input,
            summaryModel: summary.model,
            embeddingModel: embedding.model,
          }),
        )
        .digest("hex");
      const existing = await readTopicExecutionForRequest(
        input.projectId,
        input.requestId,
        requestHash,
      );
      if (existing) {
        if (existing.status === "queued")
          await enqueueTopicExecution(input.projectId, existing.id);
        return {
          id: existing.id,
          traceCount: existing.facets[0]?.counts.requested ?? 0,
        };
      }
      await requireFacetVersions(input.projectId, input.facets);
      const now = new Date();
      const { traceIds, days } = await selectTopicSetupTraces({
        projectId: input.projectId,
        sampling: input.sampling,
        limit: TOPIC_SETUP_BACKFILL_LIMIT,
        now,
      });
      if (traceIds.length === 0) return { id: null, traceCount: 0 };
      const execution = await createTopicExecution(
        {
          operation: "process",
          projectId: input.projectId,
          requestId: input.requestId,
          facets: input.facets,
          traceIds,
          reuseExistingSummaries: true,
          embeddingConfig: {
            embeddingModel: embedding.model,
            embeddingDimensions: embedding.dimensions,
          },
          processingConfig: topicProcessingConfigSchema.parse({
            summaryModel: summary.model,
          }),
          thenUpdate: {
            // Summaries date from a trace's first event, which can precede the window.
            timeRange: {
              from: new Date(
                now.getTime() - days * 86_400_000 - SETUP_TRACE_SPAN_MARGIN_MS,
              ),
              to: now,
            },
          },
        },
        requestHash,
        ctx.session.user.id,
      );
      if (execution.status === "queued")
        await enqueueTopicExecution(input.projectId, execution.id, traceIds);
      return { id: execution.id, traceCount: traceIds.length };
    }),
  trigger: topicsWriteProcedure
    .input(topicTriggerInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { summary, embedding } = await requireTopicsModels(input.projectId);
      const models = {
        summaryModel: summary.model,
        embeddingModel: embedding.model,
        embeddingDimensions: embedding.dimensions,
      };
      const requestHash = createHash("sha256")
        .update(JSON.stringify({ input, models }))
        .digest("hex");
      const existing = await readTopicExecutionForRequest(
        input.projectId,
        input.requestId,
        requestHash,
      );
      if (existing) {
        if (existing.status === "queued")
          await enqueueTopicExecution(input.projectId, existing.id);
        return { id: existing.id };
      }
      const ruleId = input.operation === "process" ? input.ruleId : undefined;
      const rule = ruleId ? await getTopicRule(input.projectId, ruleId) : null;
      if (ruleId && !rule)
        throw new InvalidRequestError("Topic rule not found in this project.");
      if (rule && !("selection" in input))
        throw new InvalidRequestError(
          "Topic rules require a filtered trace selection.",
        );
      await requireFacetVersions(input.projectId, input.facets);
      const facetIds = new Set(input.facets.map(({ facetId }) => facetId));

      if (
        rule &&
        (rule.facetIds.length !== facetIds.size ||
          !rule.facetIds.every((id) => facetIds.has(id)))
      )
        throw new InvalidRequestError(
          "Select the facets attached to this Topic rule, or save its changes first.",
        );
      if (rule && "selection" in input) {
        // Reject stale previews instead of silently running a newly edited rule.
        const selected = topicRuleConfigSchema.parse(input.selection);
        const saved = topicRuleConfigSchema.parse(rule);
        if (JSON.stringify(selected) !== JSON.stringify(saved))
          throw new InvalidRequestError(
            "This Topic rule changed. Reload it and preview the traces again.",
          );
      }
      const resolvedInput = await resolveTopicTraceSelection(input, ctx.prisma);
      const configuredInput = topicExecutionInputSchema.parse({
        ...resolvedInput,
        embeddingConfig: {
          embeddingModel: models.embeddingModel,
          embeddingDimensions: models.embeddingDimensions,
        },
        ...(resolvedInput.operation === "process"
          ? {
              processingConfig: {
                ...resolvedInput.processingConfig,
                summaryModel: models.summaryModel,
              },
            }
          : {}),
      });
      const execution = await createTopicExecution(
        configuredInput,
        requestHash,
        ctx.session.user.id,
      );
      if (execution.status === "queued")
        await enqueueTopicExecution(
          input.projectId,
          execution.id,
          execution.input.operation === "process"
            ? execution.input.traceIds
            : undefined,
        );
      return { id: execution.id };
    }),
  retry: topicsWriteProcedure
    .input(executionInput)
    .mutation(async ({ input }) => {
      const execution = await executionWithRecovery(
        input.projectId,
        input.executionId,
      );
      if (!canResume(execution))
        throw new InvalidRequestError(
          "Only failed or interrupted executions can be resumed.",
        );
      await enqueueTopicExecution(input.projectId, execution.id);
    }),
  map: topicsProcedure
    .input(mapInput)
    .query(({ input }) => publishedTopicMap(input)),
});
