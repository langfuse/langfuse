import { z } from "zod";
import { createHash } from "node:crypto";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import {
  topicEmbeddingConfigSchema,
  topicIdSchema,
  topicTraceIdSchema,
  topicRuleConfigSchema,
  type TopicExecutionSummary,
  type TopicRun,
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
  listTopicRuns,
  getTopicRun,
  readTopicSummaries,
  listTopicSummaries,
  readTopicAssignments,
  readTopicMapAssignments,
  readTopicRunSummaryIds,
  loadTopicTranscript,
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

function publicRun(run: TopicRun) {
  return {
    id: run.id,
    facetVersionId: run.facetVersionId,
    runSequence: run.runSequence,
    publishedAt: run.publishedAt,
    topics: (run.publishedAt ? run.topics : []).map((topic) => ({
      id: topic.topicId,
      name: topic.name,
      description: topic.description,
    })),
  };
}

async function latestFacetSummaries(projectId: string, facetVersionId: string) {
  const facet = await getTopicFacetVersion(projectId, facetVersionId);
  if (!facet) throw new LangfuseNotFoundError("Facet version not found.");
  return getLatestFacetSummaries(projectId, facet.facetId, facetVersionId);
}

async function executionWithRecovery(projectId: string, executionId: string) {
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!execution) throw new LangfuseNotFoundError("Execution not found.");
  return recoverExecutionState(execution);
}

async function recoverExecutionState(execution: TopicExecutionSummary) {
  if (
    execution.status === "running" ||
    execution.status === "queued" ||
    execution.status === "failed" ||
    (execution.status === "completed_with_errors" &&
      execution.facets.some(
        (facet) => facet.outcome === "pending" || facet.outcome === "failed",
      ))
  ) {
    const queueState = await getTopicExecutionQueueState(
      execution.projectId,
      execution.id,
      execution.input.operation,
    );
    if (
      [
        "active",
        "waiting",
        "delayed",
        "prioritized",
        "waiting-children",
      ].includes(queueState) &&
      (execution.status === "failed" ||
        execution.status === "completed_with_errors")
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

type MapSummary = {
  traceId: string;
  summary: string;
  summaryId: string;
  topicId: string | null;
  outcome: "assigned" | "outlier" | "unassigned";
};
type TopicMap = {
  status: "ready" | "unavailable";
  reason: string | null;
  runId: string | null;
  missingSummaryCount: number;
  points: (MapSummary & { x: number; y: number })[];
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
  if (!run.publishedAt) return unavailable;
  const [summaryIds, discoveryAssignments] = await Promise.all([
    readTopicRunSummaryIds(input.projectId, run.id),
    readTopicMapAssignments(input.projectId, run.id),
  ]);
  if (!summaryIds.length)
    return {
      ...unavailable,
      reason: "The discovery cohort is unavailable for this map.",
    };
  const discoveryIds = new Set(summaryIds);
  const projectedById = new Map(
    discoveryAssignments
      .filter(
        (row) =>
          row.projectId === input.projectId &&
          row.runId === run.id &&
          row.origin === "initial" &&
          row.facetVersionId === run.facetVersionId &&
          discoveryIds.has(row.summaryId) &&
          row.coordinates?.length === 2 &&
          row.coordinates.every(Number.isFinite),
      )
      .map((row) => [row.summaryId, row]),
  );
  if (projectedById.size !== discoveryIds.size)
    return {
      ...unavailable,
      reason:
        "Saved coordinates are not fully available for the discovery cohort.",
    };

  const summaries = await latestFacetSummaries(
    input.projectId,
    run.facetVersionId,
  );
  const byId = new Map(
    summaries
      .filter(
        (row) =>
          row.projectId === input.projectId &&
          row.facetVersionId === run.facetVersionId &&
          row.traceId !== null,
      )
      .map((row) => [row.id, row]),
  );
  const topicIds = new Set(run.topics.map((topic) => topic.topicId));
  const points = summaryIds.flatMap((id): TopicMap["points"] => {
    const row = byId.get(id);
    if (!row || row.traceId === null) return [];
    const projected = projectedById.get(id)!;
    const [x, y] = projected.coordinates!;
    const assignment =
      projected.topicId === null || topicIds.has(projected.topicId)
        ? projected
        : undefined;
    let outcome: MapSummary["outcome"] = "unassigned";
    if (assignment) outcome = assignment.topicId ? "assigned" : "outlier";
    return [
      {
        summaryId: row.id,
        traceId: row.traceId,
        summary: row.summary,
        topicId: assignment?.topicId ?? null,
        outcome,
        x,
        y,
      },
    ];
  });
  const unpositionedCount = [...byId.keys()].filter(
    (id) => !discoveryIds.has(id),
  ).length;
  return {
    status: "ready",
    reason: null,
    runId: run.id,
    missingSummaryCount: summaryIds.length - points.length,
    points,
    unpositionedCount,
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
  runs: topicsProcedure.query(async ({ input }) =>
    (await listTopicRuns(input.projectId)).map(publicRun),
  ),
  summaryCounts: topicsProcedure
    .input(
      projectInput.extend({
        facetVersionIds: z.array(topicIdSchema).min(1),
        embeddingConfig: topicEmbeddingConfigSchema,
      }),
    )
    .query(async ({ input }) => {
      for (const id of input.facetVersionIds) {
        if (!(await getTopicFacetVersion(input.projectId, id)))
          throw new InvalidRequestError(
            "Facet version not found in this project.",
          );
      }
      return getTopicSummaryCounts(
        input.projectId,
        input.facetVersionIds,
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
      return readTopicExecutionTraceErrors(input.projectId, input.executionId);
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
      const facetIds = new Set<string>();
      for (const id of input.facetVersionIds) {
        const version = await getTopicFacetVersion(input.projectId, id);
        if (!version)
          throw new InvalidRequestError(
            "Facet version not found in this project.",
          );
        facetIds.add(version.facetId);
      }

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
      if (
        execution.status !== "failed" &&
        !(
          execution.status === "completed_with_errors" &&
          execution.facets.some(
            (facet) =>
              facet.outcome === "pending" || facet.outcome === "failed",
          )
        )
      )
        throw new InvalidRequestError(
          "Only failed or interrupted executions can be resumed.",
        );
      await enqueueTopicExecution(
        input.projectId,
        execution.id,
        execution.input.operation,
      );
      return {
        ...execution,
        status: "queued" as const,
        phase: "queued",
        error: null,
      };
    }),
  results: topicsProcedure
    .input(executionInput.extend({ facetVersionId: topicIdSchema }))
    .query(async ({ input }) => {
      const execution = await readTopicExecutionSummary(
        input.projectId,
        input.executionId,
      );
      const facet = execution?.facets.find(
        (f) => f.facetVersionId === input.facetVersionId,
      );
      if (!execution || !facet)
        throw new LangfuseNotFoundError("Execution facet not found.");
      const run = facet.runId
        ? await getTopicRun(input.projectId, facet.runId)
        : null;
      const summaries = await latestFacetSummaries(
        input.projectId,
        input.facetVersionId,
      );
      const assignments = run?.publishedAt
        ? await readTopicAssignments(
            input.projectId,
            summaries.map((row) => row.id),
            run.id,
          )
        : [];
      const assignmentBySummary = new Map(
        assignments.map((row) => [row.summaryId, row]),
      );
      return {
        run: run ? publicRun(run) : null,
        rows: summaries
          .filter((row) => row.traceId !== null)
          .map((summary) => {
            const stored = assignmentBySummary.get(summary.id);
            const assignment =
              summary.state === "complete" &&
              stored?.summaryProcessedAt === summary.processedAt
                ? stored
                : undefined;
            let outcome: string = summary.state;
            if (summary.state === "complete") outcome = "awaiting_map";
            if (assignment)
              outcome = assignment.topicId ? "assigned" : "outlier";
            return {
              id: summary.id,
              traceId: summary.traceId,
              summary: summary.summary,
              outcome,
              topicId: assignment?.topicId ?? null,
              distance: assignment?.distance ?? null,
            };
          }),
      };
    }),
  map: topicsProcedure
    .input(mapInput)
    .query(({ input }) => publishedTopicMap(input)),
  traceSummaries: topicsProcedure
    .input(projectInput.extend({ traceId: topicTraceIdSchema }))
    .query(async ({ input }) => {
      const [summaries, facets] = await Promise.all([
        listTopicSummaries(input.projectId, { traceIds: [input.traceId] }),
        listTopicFacets(input.projectId),
      ]);
      return summaries
        .map((summary) => ({
          id: summary.id,
          facetName:
            facets.find((facet) => facet.id === summary.facetId)?.name ??
            "Deleted facet",
          facetVersionId: summary.facetVersionId,
          facetVersion: summary.facetVersion,
          summary: summary.summary,
          state: summary.state,
          processedAt: summary.processedAt,
        }))
        .sort(
          (a, b) =>
            a.facetName.localeCompare(b.facetName) ||
            b.facetVersion - a.facetVersion,
        );
    }),
  transcript: topicsProcedure
    .input(projectInput.extend({ traceId: topicTraceIdSchema }))
    .query(async ({ input }) => {
      const { transcript } = await loadTopicTranscript(input);
      return {
        text: transcript.text,
        coverage: transcript.coverage,
      };
    }),
  inspect: topicsProcedure
    .input(executionInput.extend({ summaryId: topicIdSchema }))
    .query(async ({ input }) => {
      const execution = await readTopicExecutionSummary(
        input.projectId,
        input.executionId,
      );
      if (!execution) throw new LangfuseNotFoundError("Execution not found.");
      const [summary] = await readTopicSummaries(input.projectId, [
        input.summaryId,
      ]);
      if (
        !summary ||
        summary.id !== input.summaryId ||
        summary.traceId === null ||
        !execution.facets.some(
          (facet) => facet.facetVersionId === summary.facetVersionId,
        )
      )
        throw new LangfuseNotFoundError("Trace summary not found.");
      let projection:
        | Awaited<ReturnType<typeof loadTopicTranscript>>["transcript"]
        | null = null;
      try {
        const current = await loadTopicTranscript({
          projectId: input.projectId,
          traceId: summary.traceId,
        });
        projection = current.transcript;
      } catch {
        // Stored summaries remain inspectable after source retention or deletion.
      }
      return {
        model: summary.summaryModel,
        projection,
      };
    }),
  compare: topicsProcedure
    .input(
      mapInput.extend({
        otherRunId: topicIdSchema,
      }),
    )
    .query(async ({ input }) => {
      const [current, other] = await Promise.all([
        getTopicRun(input.projectId, input.runId),
        getTopicRun(input.projectId, input.otherRunId),
      ]);
      if (
        !current?.publishedAt ||
        !other?.publishedAt ||
        current.projectId !== input.projectId ||
        other.projectId !== input.projectId ||
        other.facetVersionId !== current.facetVersionId
      )
        throw new InvalidRequestError(
          "Compare published maps of the same facet version.",
        );
      const summaries = await latestFacetSummaries(
        input.projectId,
        current.facetVersionId,
      );
      const summaryById = new Map(summaries.map((row) => [row.id, row]));
      const summaryIds = summaries.map((row) => row.id);
      const [currentRows, otherRows] = await Promise.all([
        readTopicAssignments(input.projectId, summaryIds, current.id),
        readTopicAssignments(input.projectId, summaryIds, other.id),
      ]);
      const byId = new Map(otherRows.map((row) => [row.summaryId, row]));
      const flows = new Map<
        string,
        { from: string; to: string; count: number }
      >();
      let compared = 0;
      for (const row of currentRows) {
        const previous = byId.get(row.summaryId);
        const summary = summaryById.get(row.summaryId);
        if (
          summary?.state !== "complete" ||
          row.summaryProcessedAt !== summary.processedAt ||
          previous?.summaryProcessedAt !== summary.processedAt
        )
          continue;
        compared++;
        const from =
          other.topics.find((topic) => topic.topicId === previous.topicId)
            ?.name ?? "Outlier";
        const to =
          current.topics.find((topic) => topic.topicId === row.topicId)?.name ??
          "Outlier";
        const key = JSON.stringify([previous.topicId, row.topicId]);
        const flow = flows.get(key) ?? { from, to, count: 0 };
        flow.count++;
        flows.set(key, flow);
      }
      return {
        compared,
        total: summaryIds.length,
        flows: [...flows.values()].sort((a, b) => b.count - a.count),
      };
    }),
});
