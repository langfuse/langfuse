import { z } from "zod";
import { createHash } from "node:crypto";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import type { Transcript } from "@langfuse/shared/src/server";
import {
  topicEmbeddingConfigSchema,
  topicIdSchema,
  topicFacetRefSchema,
  topicRuleConfigSchema,
  type TopicExecutionSummary,
  type TopicFacetRef,
} from "@langfuse/shared/topics";
import {
  createTopicExecution,
  readTopicExecutionForRequest,
  readTopicExecutionSummary,
  readTopicExecutionTraceErrors,
  getTopicSummaryCounts,
  listTopicExecutions,
  listTopicFacets,
  ensureDefaultTopicFacets,
  getTopicFacetVersion,
  getLatestFacetSummaries,
  createTopicFacet,
  createTopicFacetVersion,
  listTopicRules,
  getTopicRule,
  saveTopicRule,
  getTopicRun,
  readTopicSummaries,
  readTopicMapAssignments,
  loadTopicTranscript,
  isTopicsEnabled,
  isTopicsProjectEnabled,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
} from "@langfuse/shared/topics/server";
import {
  createTRPCRouter,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import {
  previewTopicTraces,
  resolveTopicTraceSelection,
  topicTraceSelectionSchema,
  topicTriggerInputSchema,
} from "./traceSelection";

import { currentTopicResults } from "./currentResults";

const projectInput = z.object({ projectId: topicIdSchema });
const executionInput = projectInput.extend({ executionId: topicIdSchema });
const mapInput = projectInput.extend({ runId: topicIdSchema });
const topicsProcedure = protectedProjectProcedureWithoutTracing
  .input(projectInput)
  .use(({ ctx, input, next }) => {
    if (
      !isTopicsEnabled() ||
      getContextualFeatureFlags(ctx.session.user, {
        projectId: input.projectId,
      })?.langfuseTopics !== true
    )
      throw new LangfuseNotFoundError("Topics is not available.");
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: input.projectId,
      scope: "topics:read",
    });
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
  runId: string | null;
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
}): Promise<TopicMap> {
  const run = await getTopicRun(input.projectId, input.runId);
  if (!run || run.projectId !== input.projectId)
    throw new LangfuseNotFoundError("Map not found.");
  const unavailable: TopicMap = {
    status: "unavailable",
    reason: "This map has not been published.",
    runId: run.id,
    missingSummaryCount: 0,
    points: [],
    unpositionedCount: 0,
  };
  if (run.status !== "completed") return unavailable;
  const discoveryAssignments = (
    await readTopicMapAssignments(input.projectId, run.id)
  ).sort((a, b) => a.summaryId.localeCompare(b.summaryId));
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
  );
  const byId = new Map(
    summaries
      .filter(
        (row) =>
          row.projectId === input.projectId &&
          row.facetId === run.facetId &&
          row.facetVersion === run.facetVersion &&
          row.traceId !== null,
      )
      .map((row) => [row.id, row]),
  );
  const topicIds = new Set(run.topics.map((topic) => topic.topicId));
  const points = discoveryAssignments.flatMap(
    (projected): TopicMap["points"] => {
      const row = byId.get(projected.summaryId);
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
    runId: run.id,
    missingSummaryCount: discoveryAssignments.length - points.length,
    points,
    unpositionedCount: byId.size - points.length,
  };
}

export const topicsRouter = createTRPCRouter({
  currentResults: topicsProcedure.query(({ input }) =>
    currentTopicResults(input.projectId),
  ),
  previewTraces: topicsProcedure
    .input(topicTraceSelectionSchema)
    .query(({ input, ctx }) => previewTopicTraces(input, ctx.prisma)),
  facets: topicsProcedure.query(({ input }) =>
    listTopicFacets(input.projectId),
  ),
  initialize: topicsWriteProcedure.mutation(({ input }) =>
    ensureDefaultTopicFacets(input.projectId),
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
    .mutation(({ input }) => saveTopicRule(input)),
  summaryCounts: topicsProcedure
    .input(
      projectInput.extend({
        facets: z.array(topicFacetRefSchema).min(1),
        embeddingConfig: topicEmbeddingConfigSchema,
      }),
    )
    .query(async ({ input }) => {
      await requireFacetVersions(input.projectId, input.facets);
      return getTopicSummaryCounts(
        input.projectId,
        input.facets,
        input.embeddingConfig,
      );
    }),
  executions: topicsProcedure.query(async ({ input }) =>
    Promise.all(
      (await listTopicExecutions(input.projectId)).map(recoverExecutionState),
    ),
  ),
  execution: topicsProcedure
    .input(executionInput)
    .query(({ input }) =>
      executionWithRecovery(input.projectId, input.executionId),
    ),
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
  trigger: topicsWriteProcedure
    .input(topicTriggerInputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!isTopicsProjectEnabled(input.projectId))
        throw new InvalidRequestError(
          "Topics processing is not enabled for this project.",
        );
      const requestHash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const existing = await readTopicExecutionForRequest(
        input.projectId,
        input.requestId,
        requestHash,
      );
      if (existing) {
        if (existing.status === "queued")
          await enqueueTopicExecution(
            input.projectId,
            existing.id,
            existing.input.operation,
          );
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
      const execution = await createTopicExecution(
        await resolveTopicTraceSelection(input, ctx.prisma),
        requestHash,
        ctx.session.user.id,
      );
      if (execution.status === "queued")
        await enqueueTopicExecution(
          input.projectId,
          execution.id,
          execution.input.operation,
          execution.input.operation === "process"
            ? execution.input.traceIds
            : undefined,
        );
      return { id: execution.id };
    }),
  retry: topicsWriteProcedure
    .input(executionInput)
    .mutation(async ({ input }) => {
      if (!isTopicsProjectEnabled(input.projectId))
        throw new InvalidRequestError(
          "Topics processing is not enabled for this project.",
        );
      const execution = await executionWithRecovery(
        input.projectId,
        input.executionId,
      );
      if (!canResume(execution))
        throw new InvalidRequestError(
          "Only failed or interrupted executions can be resumed.",
        );
      await enqueueTopicExecution(
        input.projectId,
        execution.id,
        execution.input.operation,
      );
    }),
  map: topicsProcedure
    .input(mapInput)
    .query(({ input }) => publishedTopicMap(input)),
  inspect: topicsProcedure
    .input(projectInput.extend({ summaryId: topicIdSchema }))
    .query(async ({ input }) => {
      const [summary] = await readTopicSummaries(input.projectId, [
        input.summaryId,
      ]);
      if (
        !summary ||
        summary.id !== input.summaryId ||
        summary.projectId !== input.projectId ||
        summary.traceId === null
      )
        throw new LangfuseNotFoundError("Trace summary not found.");
      let transcript: Transcript | null = null;
      try {
        const current = await loadTopicTranscript({
          projectId: input.projectId,
          traceId: summary.traceId,
        });
        transcript = current.transcript;
      } catch {
        // Stored summaries remain inspectable after source retention or deletion.
      }
      return {
        model: summary.summaryModel,
        transcript,
      };
    }),
});
