import { z } from "zod";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import {
  topicExecutionInputSchema,
  topicEmbeddingConfigSchema,
  topicIdSchema,
  topicTraceIdSchema,
  topicProcessingConfigSchema,
  type TopicExecution,
  type TopicRun,
  type TopicSummary,
} from "@langfuse/shared/topics";
import {
  createTopicExecution,
  readTopicExecution,
  listTopicExecutions,
  listTopicFacets,
  ensureDefaultTopicFacets,
  getTopicFacetVersion,
  createTopicFacet,
  createTopicFacetVersion,
  listTopicRuns,
  getTopicRun,
  readTopicSummaries,
  listTopicSummaries,
  readTopicAssignments,
  readTopicArtifact,
  loadTopicTranscript,
  isTopicsEnabled,
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
  topicTraceSelectionSchema,
} from "./traceSelection";

import { currentTopicResults } from "./currentResults";

const projectInput = z.object({ projectId: topicIdSchema });
const executionInput = projectInput.extend({ executionId: topicIdSchema });
const processingConfigPatchSchema = z.object({
  summaryModel: topicProcessingConfigSchema.shape.summaryModel
    .unwrap()
    .optional(),
  projection: topicProcessingConfigSchema.shape.projection.unwrap().optional(),
  maxInputTokens: topicProcessingConfigSchema.shape.maxInputTokens
    .unwrap()
    .optional(),
  maxOutputTokens: topicProcessingConfigSchema.shape.maxOutputTokens
    .unwrap()
    .optional(),
  assemblerVersion: topicProcessingConfigSchema.shape.assemblerVersion
    .unwrap()
    .optional(),
});
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
    status: run.status,
    phase: run.phase,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    publishedAt: run.publishedAt,
    metrics: run.metrics,
    error: run.error,
    topics: (run.publishedAt ? run.topics : []).map((topic) => ({
      id: topic.topicId,
      name: topic.name,
      description: topic.description,
      radius: topic.radius,
      representativeSummaryIds: topic.representativeSummaryIds,
    })),
  };
}

async function executionWithRecovery(projectId: string, executionId: string) {
  const execution = await readTopicExecution(projectId, executionId);
  if (!execution) throw new LangfuseNotFoundError("Execution not found.");
  return recoverExecutionState(execution);
}

async function recoverExecutionState(execution: TopicExecution) {
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

type MapSummary = Pick<TopicSummary, "traceId" | "summary" | "state"> & {
  summaryId: string;
  topicId: string | null;
  outcome: "assigned" | "outlier" | "unassigned";
};
type TopicMap = {
  status: "ready" | "unavailable";
  reason: string | null;
  runId: string | null;
  discoveryExecutionId: string | null;
  discoveryCount: number;
  missingSummaryCount: number;
  points: (MapSummary & { x: number; y: number; inExecution: boolean })[];
  unpositioned: MapSummary[];
};
const mapCoordinatesSchema = z.object({
  status: z.literal("complete"),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

async function publishedTopicMap(input: {
  projectId: string;
  executionId: string;
  facetVersionId: string;
}): Promise<TopicMap> {
  const execution = await readTopicExecution(
    input.projectId,
    input.executionId,
  );
  const facet = execution?.facets.find(
    (item) => item.facetVersionId === input.facetVersionId,
  );
  if (!facet) throw new LangfuseNotFoundError("Execution facet not found.");
  const unavailable: TopicMap = {
    status: "unavailable",
    reason: "This batch does not have a published map.",
    runId: null,
    discoveryExecutionId: null,
    discoveryCount: 0,
    missingSummaryCount: 0,
    points: [],
    unpositioned: [],
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
  unavailable.discoveryCount = run.summaryIds.length;
  const originId = topicIdSchema.safeParse(run.config.executionId);
  const artifactKey = topicIdSchema.safeParse(run.artifactPath);
  if (
    !originId.success ||
    !artifactKey.success ||
    !run.summaryIds.length ||
    new Set(run.summaryIds).size !== run.summaryIds.length
  )
    return {
      ...unavailable,
      reason:
        "The saved coordinates or discovery manifest are unavailable for this map.",
    };
  const origin = await readTopicExecution(input.projectId, originId.data);
  if (
    !origin ||
    origin.input.operation === "assign" ||
    !origin.facets.some(
      (item) =>
        item.facetVersionId === input.facetVersionId && item.runId === run.id,
    )
  )
    return {
      ...unavailable,
      reason: "The discovery execution for this map is unavailable.",
    };
  unavailable.discoveryExecutionId = origin.id;
  let artifact: unknown;
  try {
    artifact = await readTopicArtifact(
      input.projectId,
      origin.id,
      artifactKey.data,
    );
  } catch {
    return {
      ...unavailable,
      reason: "The saved coordinates for this map could not be read.",
    };
  }
  const numeric = mapCoordinatesSchema.safeParse(artifact);
  if (
    !numeric.success ||
    numeric.data.coordinates.length !== run.summaryIds.length
  )
    return {
      ...unavailable,
      reason:
        "Saved coordinates are missing or do not match the discovery cohort.",
    };

  const discoveryIds = new Set(run.summaryIds);
  const executionIds = new Set(facet.summaryIds);
  const summaryIds = [...new Set([...run.summaryIds, ...facet.summaryIds])];
  const [summaries, assignments] = await Promise.all([
    readTopicSummaries(input.projectId, summaryIds),
    readTopicAssignments(input.projectId, summaryIds, run.id),
  ]);
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
    assignments
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
  const publicSummary = (row: TopicSummary): MapSummary => {
    const assignment = assignedById.get(row.id);
    return {
      summaryId: row.id,
      traceId: row.traceId,
      summary: row.summary,
      state: row.state,
      topicId: assignment?.outcome === "assigned" ? assignment.topicId : null,
      outcome:
        assignment?.outcome === "assigned"
          ? "assigned"
          : assignment?.outcome === "outlier"
            ? "outlier"
            : "unassigned",
    };
  };
  // Coordinates retain manifest indices even if a summary was deleted or a query returns another order.
  const points = run.summaryIds.flatMap((id, index) => {
    const row = byId.get(id);
    if (!row) return [];
    const [x, y] = numeric.data.coordinates[index];
    return [{ ...publicSummary(row), x, y, inExecution: executionIds.has(id) }];
  });
  const unpositioned = [...executionIds].flatMap((id) => {
    const row = byId.get(id);
    return row && !discoveryIds.has(id) ? [publicSummary(row)] : [];
  });
  return {
    status: "ready",
    reason: null,
    runId: run.id,
    discoveryExecutionId: origin.id,
    discoveryCount: run.summaryIds.length,
    missingSummaryCount: run.summaryIds.length - points.length,
    points,
    unpositioned,
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
        processingConfig: processingConfigPatchSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.facetId)
        return createTopicFacetVersion({ ...input, facetId: input.facetId });
      return createTopicFacet(input);
    }),
  runs: topicsProcedure.query(async ({ input }) =>
    (await listTopicRuns(input.projectId)).map(publicRun),
  ),
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
  trigger: topicsWriteProcedure
    .input(topicExecutionInputSchema)
    .mutation(async ({ input }) => {
      for (const id of input.facetVersionIds) {
        if (!(await getTopicFacetVersion(input.projectId, id)))
          throw new InvalidRequestError(
            "Facet version not found in this project.",
          );
        if (input.operation === "assign") {
          const run = await getTopicRun(
            input.projectId,
            input.targetRunIds[id]!,
          );
          if (!run?.publishedAt || run.facetVersionId !== id)
            throw new InvalidRequestError(
              "Select a published map of the same facet version.",
            );
          const embeddingConfig = runEmbeddingConfig(run);
          if (
            !embeddingConfig ||
            embeddingConfig.embeddingModel !==
              input.embeddingConfig.embeddingModel ||
            embeddingConfig.embeddingDimensions !==
              input.embeddingConfig.embeddingDimensions
          )
            throw new InvalidRequestError(
              "The selected map uses different embedding settings. Match its model and dimensions before assigning traces.",
            );
        }
      }
      if (input.operation === "recluster") {
        for (const id of input.sourceExecutionIds) {
          const source = await readTopicExecution(input.projectId, id);
          if (
            !source ||
            !["completed", "completed_with_errors"].includes(source.status)
          )
            throw new InvalidRequestError(
              "Select completed source executions from this project.",
            );
          if (
            !input.facetVersionIds.every((facetVersionId) =>
              source.facets.some(
                (facet) => facet.facetVersionId === facetVersionId,
              ),
            )
          )
            throw new InvalidRequestError(
              "Each source execution must contain every selected facet version.",
            );
        }
      }
      const execution = await createTopicExecution(input);
      if (execution.status === "queued")
        await enqueueTopicExecution(input.projectId, execution.id);
      return execution;
    }),
  retry: topicsWriteProcedure
    .input(executionInput)
    .mutation(async ({ input }) => {
      const execution = await executionWithRecovery(
        input.projectId,
        input.executionId,
      );
      if (execution.status === "budget_exhausted")
        throw new InvalidRequestError(
          "The validation budget is exhausted. This run cannot make further model calls.",
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
      await enqueueTopicExecution(input.projectId, execution.id);
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
      const execution = await readTopicExecution(
        input.projectId,
        input.executionId,
      );
      const facet = execution?.facets.find(
        (f) => f.facetVersionId === input.facetVersionId,
      );
      if (!facet) throw new LangfuseNotFoundError("Execution facet not found.");
      const run = facet.runId
        ? await getTopicRun(input.projectId, facet.runId)
        : null;
      const [summaries, assignments] = await Promise.all([
        readTopicSummaries(input.projectId, facet.summaryIds),
        run?.publishedAt
          ? readTopicAssignments(input.projectId, facet.summaryIds, run.id)
          : Promise.resolve([]),
      ]);
      return {
        run: run ? publicRun(run) : null,
        summaries: summaries.map((s) => ({
          id: s.id,
          traceId: s.traceId,
          state: s.state,
          summary: s.summary,
          processedAt: s.processedAt,
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
          transcriptVersion:
            typeof summary.metadata.transcriptVersion === "string"
              ? summary.metadata.transcriptVersion
              : null,
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
        transcriptVersion: transcript.transcriptVersion,
      };
    }),
  inspect: topicsProcedure
    .input(executionInput.extend({ summaryId: topicIdSchema }))
    .query(async ({ input }) => {
      const execution = await readTopicExecution(
        input.projectId,
        input.executionId,
      );
      if (
        !execution?.facets.some((f) => f.summaryIds.includes(input.summaryId))
      )
        throw new LangfuseNotFoundError("Summary not in this execution.");
      const [summary] = await readTopicSummaries(input.projectId, [
        input.summaryId,
      ]);
      if (!summary) throw new LangfuseNotFoundError("Summary not found.");
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
        snapshotHash: summary.snapshotHash,
        model: summary.summaryModel,
        metadata: summary.metadata,
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
      const execution = await readTopicExecution(
        input.projectId,
        input.executionId,
      );
      const facet = execution?.facets.find(
        (item) => item.facetVersionId === input.facetVersionId,
      );
      if (!facet?.runId)
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
      const [currentRows, otherRows] = await Promise.all([
        readTopicAssignments(input.projectId, facet.summaryIds, current.id),
        readTopicAssignments(input.projectId, facet.summaryIds, other.id),
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
        total: facet.summaryIds.length,
        flows: [...flows.values()].sort((a, b) => b.count - a.count),
      };
    }),
});
