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
  type TopicSummary,
} from "@langfuse/shared/topics";
import {
  createTopicExecution,
  readTopicExecutionForRequest,
  readTopicExecutionSummary,
  readTopicExecutionSummaryIds,
  readTopicExecutionTraceErrors,
  getTopicSummaryCounts,
  listTopicExecutions,
  listTopicFacets,
  ensureDefaultTopicFacets,
  getTopicFacetVersion,
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

function runEmbeddingConfig(run: TopicRun) {
  if (
    typeof run.config?.embeddingModel !== "string" ||
    typeof run.config.dimensions !== "number"
  )
    return null;
  const config = topicEmbeddingConfigSchema.safeParse({
    embeddingModel: run.config.embeddingModel,
    embeddingDimensions: run.config.dimensions,
  });
  return config.success ? config.data : null;
}

function publicRun(run: TopicRun) {
  return {
    id: run.id,
    embeddingConfig: runEmbeddingConfig(run),
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
  executionId: string;
  facetVersionId: string;
}): Promise<TopicMap> {
  const execution = await readTopicExecutionSummary(
    input.projectId,
    input.executionId,
  );
  const facet = execution?.facets.find(
    (item) => item.facetVersionId === input.facetVersionId,
  );
  if (!execution || !facet)
    throw new LangfuseNotFoundError("Execution facet not found.");
  const unavailable: TopicMap = {
    status: "unavailable",
    reason: "This batch does not have a published map.",
    runId: null,
    missingSummaryCount: 0,
    points: [],
    unpositionedCount: 0,
  };
  const run = facet.runId
    ? await getTopicRun(input.projectId, facet.runId)
    : null;
  if (!run?.publishedAt) return unavailable;
  if (
    run.projectId !== input.projectId ||
    run.facetVersionId !== input.facetVersionId
  )
    throw new LangfuseNotFoundError("Execution map not found.");
  unavailable.runId = run.id;
  const originId = topicIdSchema.safeParse(run.config.executionId);
  if (
    !originId.success ||
    !run.summaryIds.length ||
    new Set(run.summaryIds).size !== run.summaryIds.length
  )
    return {
      ...unavailable,
      reason: "The discovery cohort is unavailable for this map.",
    };
  const origin = await readTopicExecutionSummary(
    input.projectId,
    originId.data,
  );
  if (
    !origin ||
    origin.input.operation !== "update" ||
    !origin.facets.some(
      (item) =>
        item.facetVersionId === input.facetVersionId && item.runId === run.id,
    )
  )
    return {
      ...unavailable,
      reason: "The discovery execution for this map is unavailable.",
    };
  const discoveryIds = new Set(run.summaryIds);
  const discoveryAssignments = await readTopicMapAssignments(
    input.projectId,
    run.id,
    origin.id,
  );
  const projectedById = new Map(
    discoveryAssignments
      .filter(
        (row) =>
          row.projectId === input.projectId &&
          row.runId === run.id &&
          row.executionId === origin.id &&
          row.facetVersionId === input.facetVersionId &&
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

  const executionIds = new Set(
    execution.input.operation === "update"
      ? run.summaryIds
      : (await readTopicExecutionSummaryIds(input.projectId, input.executionId))
          .filter((row) => row.facetVersionId === input.facetVersionId)
          .map((row) => row.summaryId),
  );
  const summaryIds = [...new Set([...run.summaryIds, ...executionIds])];
  const summaries = await readTopicSummaries(input.projectId, summaryIds);
  const byId = new Map(
    summaries
      .filter(
        (row) =>
          row.projectId === input.projectId &&
          row.facetVersionId === input.facetVersionId,
      )
      .map((row) => [row.id, row]),
  );
  const topicIds = new Set(run.topics.map((topic) => topic.topicId));
  const assignedById = new Map(
    [...projectedById.values()]
      .filter(
        (row) =>
          row.projectId === input.projectId &&
          row.facetVersionId === input.facetVersionId &&
          row.runId === run.id &&
          (row.outcome === "outlier" ||
            (row.topicId !== null && topicIds.has(row.topicId))),
      )
      .map((row) => [row.summaryId, row]),
  );
  const points = run.summaryIds.flatMap((id): TopicMap["points"] => {
    const row = byId.get(id);
    if (!row || row.traceId === null) return [];
    const [x, y] = projectedById.get(id)!.coordinates!;
    const assignment = assignedById.get(row.id);
    return [
      {
        summaryId: row.id,
        traceId: row.traceId,
        summary: row.summary,
        topicId: assignment?.outcome === "assigned" ? assignment.topicId : null,
        outcome:
          assignment?.outcome === "assigned" ||
          assignment?.outcome === "outlier"
            ? assignment.outcome
            : "unassigned",
        x,
        y,
      },
    ];
  });
  const unpositionedCount = [...executionIds].filter(
    (id) => byId.has(id) && !discoveryIds.has(id),
  ).length;
  return {
    status: "ready",
    reason: null,
    runId: run.id,
    missingSummaryCount: run.summaryIds.length - points.length,
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
      const summaryIds =
        execution.input.operation === "update"
          ? (run?.summaryIds ?? [])
          : (
              await readTopicExecutionSummaryIds(
                input.projectId,
                input.executionId,
              )
            )
              .filter((row) => row.facetVersionId === input.facetVersionId)
              .map((row) => row.summaryId);
      const [summaries, assignments] = await Promise.all([
        readTopicSummaries(input.projectId, summaryIds),
        run?.publishedAt
          ? readTopicAssignments(input.projectId, summaryIds, run.id)
          : Promise.resolve([]),
      ]);
      return {
        run: run ? publicRun(run) : null,
        summaries: summaries
          .filter((row) => row.traceId !== null)
          .map((s) => ({
            id: s.id,
            traceId: s.traceId,
            state: s.state,
            summary: s.summary,
          })),
        assignments,
      };
    }),
  map: topicsProcedure
    .input(executionInput.extend({ facetVersionId: topicIdSchema }))
    .query(({ input }) => publishedTopicMap(input)),
  traceSummaries: topicsProcedure
    .input(projectInput.extend({ traceId: topicTraceIdSchema }))
    .query(async ({ input }) => {
      const [summaries, facets] = await Promise.all([
        listTopicSummaries(input.projectId, { traceIds: [input.traceId] }),
        listTopicFacets(input.projectId),
      ]);
      const latest = new Map<string, TopicSummary>();
      for (const summary of summaries) {
        const previous = latest.get(summary.facetVersionId);
        if (!previous || BigInt(summary.revision) > BigInt(previous.revision))
          latest.set(summary.facetVersionId, summary);
      }
      return [...latest.values()]
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
          inputHash: summary.inputHash,
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
        inputHash: transcript.inputHash,
      };
    }),
  inspect: topicsProcedure
    .input(executionInput.extend({ summaryId: topicIdSchema }))
    .query(async ({ input }) => {
      const execution = await readTopicExecutionSummary(
        input.projectId,
        input.executionId,
      );
      if (!execution)
        throw new LangfuseNotFoundError("Summary not in this execution.");
      const accepted =
        execution.input.operation === "update"
          ? (
              await Promise.all(
                execution.facets.map(async ({ runId }) =>
                  runId
                    ? ((await getTopicRun(input.projectId, runId))
                        ?.summaryIds ?? [])
                    : [],
                ),
              )
            ).flat()
          : (
              await readTopicExecutionSummaryIds(
                input.projectId,
                input.executionId,
              )
            ).map((row) => row.summaryId);
      if (!accepted.includes(input.summaryId))
        throw new LangfuseNotFoundError("Summary not in this execution.");
      const [summary] = await readTopicSummaries(input.projectId, [
        input.summaryId,
      ]);
      if (!summary || summary.traceId === null)
        throw new LangfuseNotFoundError("Trace summary not found.");
      let projection:
        | Awaited<ReturnType<typeof loadTopicTranscript>>["transcript"]
        | null = null;
      let projectionStatus: "matching" | "changed" | "unavailable" =
        "unavailable";
      try {
        const current = await loadTopicTranscript({
          projectId: input.projectId,
          traceId: summary.traceId,
        });
        projection = current.transcript;
        projectionStatus =
          projection.inputHash === summary.inputHash ? "matching" : "changed";
      } catch {
        // Stored summaries remain inspectable after source retention or deletion.
      }
      return {
        inputHash: summary.inputHash,
        model: summary.summaryModel,
        projection,
        projectionStatus,
      };
    }),
  compare: topicsProcedure
    .input(
      executionInput.extend({
        facetVersionId: topicIdSchema,
        otherRunId: topicIdSchema,
      }),
    )
    .query(async ({ input }) => {
      const execution = await readTopicExecutionSummary(
        input.projectId,
        input.executionId,
      );
      const facet = execution?.facets.find(
        (item) => item.facetVersionId === input.facetVersionId,
      );
      if (!execution || !facet?.runId)
        throw new LangfuseNotFoundError("Execution map not found.");
      const [current, other] = await Promise.all([
        getTopicRun(input.projectId, facet.runId),
        getTopicRun(input.projectId, input.otherRunId),
      ]);
      if (
        !current?.publishedAt ||
        !other?.publishedAt ||
        other.facetVersionId !== facet.facetVersionId
      )
        throw new InvalidRequestError(
          "Compare published maps of the same facet version.",
        );
      const summaryIds =
        execution.input.operation === "update"
          ? current.summaryIds
          : (
              await readTopicExecutionSummaryIds(
                input.projectId,
                input.executionId,
              )
            )
              .filter((row) => row.facetVersionId === input.facetVersionId)
              .map((row) => row.summaryId);
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
        if (!previous) continue;
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
