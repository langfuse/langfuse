import { createHash } from "node:crypto";
import { prisma, type Prisma } from "../../db";
import { getTopicProcessingMapIds } from "./postgres";
import { InvalidRequestError } from "../../errors";
import { BatchActionStatus } from "../../features/batchAction/types";
import {
  topicExecutionInputSchema,
  topicIdSchema,
  type TopicExecution,
  type TopicExecutionInput,
  type TopicExecutionSummary,
  type TopicFacetProgress,
} from "../../topics";

export const TOPICS_ACTION = "topics";
type BatchMetadata = {
  inputSettings: TopicExecutionSummary["input"];
  facets: TopicFacetProgress[];
  phase: string;
  inputHash: string;
  requestHash: string;
  progressVersion?: number;
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
    input: state.inputSettings,
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
          inputSettings,
          facets,
          phase: "queued",
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

export async function writeTopicExecution(
  execution: TopicExecutionSummary,
  progressVersion?: number,
): Promise<void> {
  const { projectId, id } = execution;
  await prisma.$transaction(async (tx) => {
    await lockExecution(tx, projectId, id);
    const current = await storedExecution(projectId, id, tx);
    if (!current) throw new Error("Topics execution does not exist.");
    const state = batchMetadata(current);
    if (hash(state.inputSettings) !== hash(execution.input))
      throw new Error("Topics execution settings cannot change.");
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
    if (execution.input.operation === "update") {
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
