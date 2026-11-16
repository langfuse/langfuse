import { createHash } from "node:crypto";
import { prisma, type Prisma } from "../../db";
import { getTopicProcessingMapIds } from "./postgres";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { BatchActionStatus } from "../../features/batchAction/types";
import {
  topicExecutionInputSchema,
  topicIdSchema,
  topicTimeRangeSchema,
  type TopicExecution,
  type TopicExecutionInput,
  type TopicExecutionSummary,
  type TopicFacetProgress,
} from "../../topics";

export const TOPICS_ACTION = "topics";
type BatchMetadata = {
  inputSettings:
    | Extract<TopicExecutionSummary["input"], { operation: "process" }>
    | (Omit<
        Extract<TopicExecutionSummary["input"], { operation: "update" }>,
        "timeRange"
      > & { timeRange: { from: string; to: string } });
  facets: TopicFacetProgress[];
  phase: string;
  inputHash: string;
  requestHash: string;
  progressVersion?: number;
  /** A snapshot's seeding state; its trace IDs are dropped once the fit is enqueued. */
  summarizing?: TopicSnapshotSummarizing;
};
/** Seeded traces and the settle clock of a snapshot that summarizes before it groups. */
export type TopicSnapshotSummarizing = {
  startedAt: string;
  /** Earliest first event of a seeded trace; summary counts start here. */
  from: string;
  /** Null until seeding succeeds; emptied once the fit is enqueued. */
  traceIds: string[] | null;
  seededCount: number;
  /** When the settled count last grew; null before the first summary. */
  grewAt: string | null;
  settled: number;
  /** Consecutive failed ticks; the snapshot fails after a few. */
  failedTicks: number;
};
type BatchRow = Prisma.BatchActionGetPayload<object>;
const statuses = {
  queued: BatchActionStatus.Queued,
  running: BatchActionStatus.Processing,
  completed: BatchActionStatus.Completed,
  completed_with_errors: BatchActionStatus.Partial,
  failed: BatchActionStatus.Failed,
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const executionIdForRequest = (projectId: string, requestId: string) =>
  createHash("sha256")
    .update(`${projectId}:${requestId}`)
    .digest("hex")
    .slice(0, 32);
const batchMetadata = (row: BatchRow) => row.config as unknown as BatchMetadata;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const facetKey = (facet: { facetId: string; facetVersion: number }) =>
  JSON.stringify([facet.facetId, facet.facetVersion]);

async function lockExecution(
  tx: Prisma.TransactionClient,
  projectId: string,
  executionId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`topics:${projectId}:${executionId}`}, 0))`;
  await tx.$queryRaw`SELECT id FROM batch_actions WHERE project_id = ${projectId} AND id = ${executionId} FOR UPDATE`;
}

async function storedExecution(
  projectId: string,
  executionId: string,
  db: Pick<Prisma.TransactionClient, "batchAction"> = prisma,
): Promise<BatchRow | null> {
  topicIdSchema.parse(projectId);
  topicIdSchema.parse(executionId);
  return db.batchAction.findFirst({
    where: { projectId, id: executionId, actionType: TOPICS_ACTION },
  });
}

function checkRequest(
  state: BatchMetadata,
  input: TopicExecutionInput,
  requestHash: string,
) {
  if (state.inputHash !== hash(input) || state.requestHash !== requestHash)
    throw new InvalidRequestError(
      "This request ID already belongs to a different Topics request.",
    );
}

// JSON storage turns time ranges into strings; restore them as dates.
function storedInput(
  settings: BatchMetadata["inputSettings"],
): TopicExecutionSummary["input"] {
  if (settings.operation === "update")
    return {
      ...settings,
      timeRange: topicTimeRangeSchema.parse(settings.timeRange),
    };
  if (!settings.thenUpdate) return settings;
  return {
    ...settings,
    thenUpdate: {
      timeRange: topicTimeRangeSchema.parse(settings.thenUpdate.timeRange),
    },
  };
}

function summaryResult(row: BatchRow): TopicExecutionSummary {
  const state = batchMetadata(row);
  const status = (
    Object.keys(statuses) as TopicExecutionSummary["status"][]
  ).find((candidate) => statuses[candidate] === row.status);
  if (!status) throw new Error("Invalid Topics execution status.");
  return {
    id: row.id,
    projectId: row.projectId,
    status,
    phase: state.phase,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    error: row.log,
    input: storedInput(state.inputSettings),
    facets: state.inputSettings.facets.map(({ facetId, version }) => {
      const facet = state.facets.find(
        (candidate) =>
          candidate.facetId === facetId && candidate.facetVersion === version,
      );
      if (!facet)
        throw new Error("Topics execution is missing a selected facet.");
      return facet;
    }),
  };
}

/** The user who started an execution, so follow-up runs stay in their History. */
export async function readTopicExecutionUserId(
  projectId: string,
  executionId: string,
): Promise<string | null> {
  const row = await storedExecution(projectId, executionId);
  return row?.userId ?? null;
}

/** Postgres owns compact execution settings and progress, never per-trace payloads. */
export async function createTopicExecution(
  rawInput: TopicExecutionInput,
  originalRequestHash?: string,
  userId?: string,
): Promise<TopicExecution> {
  const input = topicExecutionInputSchema.parse(rawInput);
  if (!userId)
    throw new InvalidRequestError("A user is required to run Topics manually.");
  input.facets = [
    ...new Map(
      input.facets.map((facet) => [
        JSON.stringify([facet.facetId, facet.version]),
        facet,
      ]),
    ).values(),
  ];
  if (input.operation === "process")
    input.traceIds = [...new Set(input.traceIds)];
  const id = executionIdForRequest(input.projectId, input.requestId);
  const requestHash = originalRequestHash ?? hash(input);
  const existing = await storedExecution(input.projectId, id);
  if (existing) {
    checkRequest(batchMetadata(existing), input, requestHash);
    return { ...summaryResult(existing), input, traceErrors: [] };
  }
  const { projectId } = input;
  const { ids, inputSettings } =
    input.operation === "process"
      ? (() => {
          const { traceIds, ...compact } = input;
          return { ids: traceIds, inputSettings: compact };
        })()
      : { ids: [], inputSettings: input };
  const mapIds =
    input.operation === "process"
      ? await getTopicProcessingMapIds(
          projectId,
          input.facets,
          input.embeddingConfig,
        )
      : [];
  const row = await prisma.$transaction(async (tx) => {
    await lockExecution(tx, projectId, id);
    const current = await storedExecution(projectId, id, tx);
    if (current) {
      checkRequest(batchMetadata(current), input, requestHash);
      return current;
    }
    const versionCount = await tx.evaluatorVersion.count({
      where: {
        evaluator: { projectId, type: "FACET" },
        OR: input.facets.map(({ facetId, version }) => ({
          evaluatorId: facetId,
          version,
        })),
      },
    });
    if (versionCount !== input.facets.length)
      throw new InvalidRequestError("Facet version not found in this project.");
    const facets: TopicFacetProgress[] = input.facets.map(
      ({ facetId, version }) => ({
        facetId,
        facetVersion: version,
        outcome: "pending",
        runId:
          input.operation === "update"
            ? hash([id, facetId, version, "run"]).slice(0, 48)
            : (mapIds.find(
                (map) =>
                  map.facetId === facetId && map.facetVersion === version,
              )?.runId ?? null),
        error: null,
        counts: {
          requested: ids.length,
          complete: 0,
          nonApplicable: 0,
          insufficientInput: 0,
          failed: 0,
          assigned: 0,
          outlier: 0,
        },
      }),
    );
    if (input.operation === "update") {
      await tx.topicClusteringRun.createMany({
        data: facets.map((facet) => ({
          id: facet.runId!,
          projectId,
          facetId: facet.facetId,
          facetVersion: facet.facetVersion,
          status: "pending",
          // A manual update is a one-off snapshot of its execution.
          batchActionId: id,
          config: {
            timeRange: {
              from: input.timeRange.from.toISOString(),
              to: input.timeRange.to.toISOString(),
            },
            // Analyses never serve, not even before a rule's first refit.
            ...(input.analysis ? { analysis: true } : {}),
          },
        })),
      });
    }
    return tx.batchAction.create({
      data: {
        id,
        projectId,
        userId,
        actionType: TOPICS_ACTION,
        tableName: "traces",
        status: BatchActionStatus.Queued,
        query: {},
        config: json({
          inputSettings:
            inputSettings.operation === "update"
              ? {
                  ...inputSettings,
                  timeRange: {
                    from: inputSettings.timeRange.from.toISOString(),
                    to: inputSettings.timeRange.to.toISOString(),
                  },
                }
              : inputSettings,
          facets,
          // A snapshot that summarizes first waits for its controller, not the update queue.
          phase:
            input.operation === "update" && input.analysis?.summarize
              ? "summarizing"
              : "queued",
          inputHash: hash(input),
          requestHash,
        } satisfies BatchMetadata),
        totalCount: input.operation === "process" ? ids.length : facets.length,
        processedCount: 0,
        failedCount: 0,
      },
    });
  });
  return { ...summaryResult(row), input, traceErrors: [] };
}

export async function readTopicExecutionForRequest(
  projectId: string,
  requestId: string,
  requestHash: string,
): Promise<TopicExecutionSummary | null> {
  topicIdSchema.parse(requestId);
  const id = executionIdForRequest(projectId, requestId);
  const stored = await storedExecution(projectId, id);
  if (!stored) return null;
  if (batchMetadata(stored).requestHash !== requestHash)
    throw new InvalidRequestError(
      "This request ID already belongs to a different Topics request.",
    );
  return summaryResult(stored);
}

export async function readTopicExecutionSummary(
  projectId: string,
  executionId: string,
): Promise<TopicExecutionSummary | null> {
  const stored = await storedExecution(projectId, executionId);
  return stored ? summaryResult(stored) : null;
}

export async function listTopicExecutions(
  projectId: string,
): Promise<TopicExecutionSummary[]> {
  topicIdSchema.parse(projectId);
  const batches = await prisma.batchAction.findMany({
    where: { projectId, actionType: TOPICS_ACTION },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return batches.map(summaryResult);
}

/** One-off analysis executions, newest first; each rerun is its own execution. */
export async function listTopicAnalysisExecutions(
  projectId: string,
): Promise<TopicExecutionSummary[]> {
  topicIdSchema.parse(projectId);
  const batches = await prisma.batchAction.findMany({
    where: {
      projectId,
      actionType: TOPICS_ACTION,
      config: {
        path: ["inputSettings", "analysis", "seed"],
        string_contains: "",
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return batches.map(summaryResult);
}

export async function writeTopicExecution(
  execution: Pick<
    TopicExecutionSummary,
    "id" | "projectId" | "status" | "phase" | "facets" | "error"
  >,
  progressVersion?: number,
): Promise<void> {
  const { projectId, id } = execution;
  await prisma.$transaction(async (tx) => {
    await lockExecution(tx, projectId, id);
    const current = await storedExecution(projectId, id, tx);
    if (!current) throw new Error("Topics execution does not exist.");
    const state = batchMetadata(current);
    if (
      progressVersion !== undefined &&
      progressVersion <= (state.progressVersion ?? 0)
    )
      return;
    const facetKeys = new Set(execution.facets.map(facetKey));
    if (
      state.facets.length !== execution.facets.length ||
      facetKeys.size !== execution.facets.length ||
      state.facets.some((facet) => !facetKeys.has(facetKey(facet)))
    )
      throw new Error("Topics execution facets cannot change.");
    const terminal =
      execution.status !== "queued" && execution.status !== "running";
    const { facets } = execution;
    let processedCount =
      execution.status === "completed" ||
      execution.status === "completed_with_errors"
        ? current.totalCount
        : null;
    let failedCount = facets.every((facet) => facet.counts.failed === 0)
      ? 0
      : null;
    if (state.inputSettings.operation === "update") {
      processedCount = facets.filter(
        (facet) => facet.outcome !== "pending",
      ).length;
      failedCount = facets.filter((facet) => facet.outcome === "failed").length;
    }
    await tx.batchAction.update({
      where: { projectId, id },
      data: {
        config: json({
          ...state,
          phase: execution.phase,
          ...(progressVersion === undefined ? {} : { progressVersion }),
          facets,
        } satisfies BatchMetadata),
        status: statuses[execution.status],
        processedCount,
        failedCount,
        finishedAt: terminal ? (current.finishedAt ?? new Date()) : null,
        log: execution.error,
      },
    });
  });
}

export async function readTopicSnapshotSummarizing(
  projectId: string,
  executionId: string,
): Promise<TopicSnapshotSummarizing | null> {
  const row = await storedExecution(projectId, executionId);
  return row ? (batchMetadata(row).summarizing ?? null) : null;
}

/** Saves a snapshot's seeded traces and settle clock beside its progress. */
export async function writeTopicSnapshotSummarizing(
  projectId: string,
  executionId: string,
  summarizing: TopicSnapshotSummarizing,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockExecution(tx, projectId, executionId);
    const current = await storedExecution(projectId, executionId, tx);
    if (!current) throw new Error("Topics execution does not exist.");
    await tx.batchAction.update({
      where: { projectId, id: executionId },
      data: {
        config: json({
          ...batchMetadata(current),
          summarizing,
        } satisfies BatchMetadata),
      },
    });
  });
}
