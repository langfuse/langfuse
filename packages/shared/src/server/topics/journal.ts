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

export const TOPICS_PROCESS_TRACES_ACTION = "trace-process-topics";
type ExecutionMetadata = {
  header: Omit<TopicExecution, "input" | "facets" | "traceErrors">;
  inputSettings: TopicExecutionSummary["input"];
  inputHash: string;
  requestHash: string;
  progressVersion?: number;
};
type FacetMetadata = Omit<TopicFacetProgress, "summaryIds">;
type RunMetadata = ExecutionMetadata & { facet: FacetMetadata };
type BatchMetadata = ExecutionMetadata & { facets: FacetMetadata[] };
type RunRow = Prisma.TopicClusteringRunGetPayload<object>;
type BatchRow = Prisma.BatchActionGetPayload<object>;
type StoredExecution = {
  state: ExecutionMetadata;
  facets: FacetMetadata[];
  rows: RunRow[];
  batch: BatchRow | null;
};

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const executionIdForRequest = (projectId: string, requestId: string) =>
  createHash("sha256")
    .update(`${projectId}:${requestId}`)
    .digest("hex")
    .slice(0, 32);
const metadata = (row: RunRow) =>
  row.executionMetadata as unknown as RunMetadata;
const batchMetadata = (row: BatchRow) => row.config as unknown as BatchMetadata;
const json = (value: unknown) => value as Prisma.InputJsonValue;
async function lockExecution(
  tx: Prisma.TransactionClient,
  projectId: string,
  executionId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`topics:${projectId}:${executionId}`}, 0))`;
  await tx.$queryRaw`SELECT id FROM topic_clustering_runs WHERE project_id = ${projectId} AND execution_id = ${executionId} ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM batch_actions WHERE project_id = ${projectId} AND id = ${executionId} FOR UPDATE`;
}

async function executionRows(
  projectId: string,
  executionId: string,
  db: Pick<Prisma.TransactionClient, "topicClusteringRun"> = prisma,
) {
  topicIdSchema.parse(projectId);
  topicIdSchema.parse(executionId);
  const rows = await db.topicClusteringRun.findMany({
    where: { projectId, executionId },
    orderBy: { id: "asc" },
  });
  return rows.filter((row) => metadata(row).header);
}

async function storedExecution(
  projectId: string,
  executionId: string,
  db: Pick<
    Prisma.TransactionClient,
    "topicClusteringRun" | "batchAction"
  > = prisma,
): Promise<StoredExecution | null> {
  topicIdSchema.parse(projectId);
  topicIdSchema.parse(executionId);
  const [batch, rows] = await Promise.all([
    db.batchAction.findFirst({
      where: {
        projectId,
        id: executionId,
        actionType: TOPICS_PROCESS_TRACES_ACTION,
      },
    }),
    executionRows(projectId, executionId, db),
  ]);
  if (batch) {
    const state = batchMetadata(batch);
    return { state, facets: state.facets, rows: [], batch };
  }
  if (!rows.length) return null;
  return {
    state: metadata(rows[0]),
    facets: rows.map((row) => metadata(row).facet),
    rows,
    batch: null,
  };
}

function checkRequest(state: ExecutionMetadata, input: TopicExecutionInput) {
  if (state.inputHash !== hash(input))
    throw new InvalidRequestError(
      "This request ID already belongs to a different Topics request.",
    );
}

function summaryResult(stored: StoredExecution): TopicExecutionSummary {
  const { state, facets } = stored;
  return {
    ...state.header,
    input: state.inputSettings,
    facets: state.inputSettings.facetVersionIds.map((id) => {
      const facet = facets.find((candidate) => candidate.facetVersionId === id);
      if (!facet)
        throw new Error("Topics execution is missing a selected facet.");
      return facet;
    }),
  };
}

/** Postgres owns compact execution settings and progress, never per-trace payloads. */
export class TopicExecutionStore {
  async create(
    rawInput: TopicExecutionInput,
    originalRequestHash?: string,
    userId?: string,
  ): Promise<TopicExecution> {
    const input = topicExecutionInputSchema.parse(rawInput);
    input.facetVersionIds = [...new Set(input.facetVersionIds)];
    if (input.operation === "process") {
      if (!userId)
        throw new InvalidRequestError(
          "A user is required to process traces manually.",
        );
      input.traceIds = [...new Set(input.traceIds)];
    }
    const id = executionIdForRequest(input.projectId, input.requestId);
    const requestHash = originalRequestHash ?? hash(input);
    const checkOriginalRequest = (state: ExecutionMetadata) => {
      if (state.requestHash !== requestHash)
        throw new InvalidRequestError(
          "This request ID already belongs to a different Topics request.",
        );
    };
    const existing = await storedExecution(input.projectId, id);
    if (existing) {
      checkOriginalRequest(existing.state);
      checkRequest(existing.state, input);
      return {
        ...summaryResult(existing),
        input,
        facets: existing.facets.map((facet) => ({ ...facet, summaryIds: [] })),
        traceErrors: [],
      };
    }
    const { projectId } = input;
    const { ids, inputSettings } =
      input.operation === "process"
        ? (() => {
            const { traceIds, traceSelection: _selection, ...compact } = input;
            return { ids: traceIds, inputSettings: compact };
          })()
        : { ids: [], inputSettings: input };
    const mapIds =
      input.operation === "process"
        ? await getTopicProcessingMapIds(
            projectId,
            input.facetVersionIds,
            input.embeddingConfig,
          )
        : {};
    await prisma.$transaction(async (tx) => {
      await lockExecution(tx, projectId, id);
      const current = await storedExecution(projectId, id, tx);
      if (current) {
        checkOriginalRequest(current.state);
        checkRequest(current.state, input);
        return;
      }
      const [sequence] = await tx.$queryRaw<
        { revision: bigint }[]
      >`SELECT nextval('topic_processing_revision_seq') AS revision`;
      const now = new Date().toISOString();
      const state: ExecutionMetadata = {
        header: {
          id,
          projectId,
          revision: sequence.revision.toString(),
          status: "queued",
          phase: "queued",
          createdAt: now,
          updatedAt: now,
          error: null,
        },
        inputSettings,
        inputHash: hash(input),
        requestHash,
      };
      const facets: FacetMetadata[] = input.facetVersionIds.map(
        (facetVersionId) => ({
          facetVersionId,
          outcome: "pending",
          runId: mapIds[facetVersionId] ?? null,
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
      if (input.operation === "process") {
        await tx.batchAction.create({
          data: {
            id,
            projectId,
            userId: userId!,
            actionType: TOPICS_PROCESS_TRACES_ACTION,
            tableName: "traces",
            status: BatchActionStatus.Queued,
            query: json({ operation: "process" }),
            config: json({ ...state, facets } satisfies BatchMetadata),
            totalCount: ids.length,
            processedCount: 0,
            failedCount: 0,
          },
        });
      } else {
        await tx.topicClusteringRun.createMany({
          data: facets.map((facet) => ({
            id: hash([id, facet.facetVersionId, "run"]).slice(0, 48),
            projectId,
            executionId: id,
            facetVersionId: facet.facetVersionId,
            status: "pending",
            phase: "queued",
            executionMetadata: json({ ...state, facet } satisfies RunMetadata),
          })),
        });
      }
    });
    const result = (await this.readSummary(projectId, id))!;
    return {
      ...result,
      input,
      facets: result.facets.map((facet) => ({ ...facet, summaryIds: [] })),
      traceErrors: [],
    };
  }

  async readForRequest(
    projectId: string,
    requestId: string,
    requestHash: string,
  ): Promise<TopicExecutionSummary | null> {
    topicIdSchema.parse(requestId);
    const id = executionIdForRequest(projectId, requestId);
    const stored = await storedExecution(projectId, id);
    if (!stored) return null;
    if (stored.state.requestHash !== requestHash)
      throw new InvalidRequestError(
        "This request ID already belongs to a different Topics request.",
      );
    return summaryResult(stored);
  }

  async readSummary(
    projectId: string,
    executionId: string,
  ): Promise<TopicExecutionSummary | null> {
    const stored = await storedExecution(projectId, executionId);
    return stored ? summaryResult(stored) : null;
  }

  async list(projectId: string): Promise<TopicExecutionSummary[]> {
    topicIdSchema.parse(projectId);
    const [batches, updates] = await Promise.all([
      prisma.batchAction.findMany({
        where: { projectId, actionType: TOPICS_PROCESS_TRACES_ACTION },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.topicClusteringRun.findMany({
        where: { projectId },
        distinct: ["executionId"],
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { executionId: true },
      }),
    ]);
    const rows = updates.length
      ? await prisma.topicClusteringRun.findMany({
          where: {
            projectId,
            executionId: { in: updates.map((row) => row.executionId) },
          },
        })
      : [];
    const executions = new Map<string, TopicExecutionSummary>();
    for (const row of batches) {
      const state = batchMetadata(row);
      executions.set(
        row.id,
        summaryResult({ state, facets: state.facets, batch: row, rows: [] }),
      );
    }
    for (const row of rows.filter((row) => metadata(row).header)) {
      if (executions.has(row.executionId)) continue;
      executions.set(
        row.executionId,
        summaryResult({
          state: metadata(row),
          facets: rows
            .filter(
              (candidate) =>
                candidate.executionId === row.executionId &&
                metadata(candidate).header,
            )
            .map((candidate) => metadata(candidate).facet),
          rows: [],
          batch: null,
        }),
      );
    }
    return [...executions.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  }

  async write(
    execution: TopicExecutionSummary,
    progressVersion?: number,
  ): Promise<void> {
    const { projectId, id } = execution;
    await prisma.$transaction(async (tx) => {
      await lockExecution(tx, projectId, id);
      const current = await storedExecution(projectId, id, tx);
      if (!current) throw new Error("Topics execution does not exist.");
      if (hash(current.state.inputSettings) !== hash(execution.input))
        throw new Error("Topics execution settings cannot change.");
      if (
        progressVersion !== undefined &&
        progressVersion <= (current.state.progressVersion ?? 0)
      )
        return;
      if (current.state.header.revision !== execution.revision)
        throw new Error("Topics execution revision cannot change.");
      if (
        current.facets.length !== execution.facets.length ||
        current.facets.some(
          (facet) =>
            !execution.facets.some(
              (candidate) => candidate.facetVersionId === facet.facetVersionId,
            ),
        )
      )
        throw new Error("Topics execution facets cannot change.");
      const {
        id: executionId,
        projectId: owner,
        revision,
        status: executionStatus,
        phase: executionPhase,
        createdAt,
        error,
      } = execution;
      const header: ExecutionMetadata["header"] = {
        id: executionId,
        projectId: owner,
        revision,
        status: executionStatus,
        phase: executionPhase,
        createdAt,
        updatedAt: new Date().toISOString(),
        error,
      };
      const facets = execution.facets.map(
        ({ facetVersionId, outcome, runId, error, counts }) => ({
          facetVersionId,
          outcome,
          runId,
          error,
          counts,
        }),
      );
      if (current.batch) {
        const terminal =
          execution.status !== "queued" && execution.status !== "running";
        const statuses = {
          queued: BatchActionStatus.Queued,
          running: BatchActionStatus.Processing,
          completed: BatchActionStatus.Completed,
          completed_with_errors: BatchActionStatus.Partial,
          failed: BatchActionStatus.Failed,
        };
        await tx.batchAction.update({
          where: { projectId, id },
          data: {
            config: json({
              ...current.state,
              header,
              ...(progressVersion === undefined ? {} : { progressVersion }),
              facets,
            } satisfies BatchMetadata),
            status: statuses[execution.status],
            processedCount:
              execution.status === "completed" ||
              execution.status === "completed_with_errors"
                ? current.batch.totalCount
                : null,
            failedCount: facets.every((facet) => facet.counts.failed === 0)
              ? 0
              : null,
            finishedAt: terminal
              ? (current.batch.finishedAt ?? new Date())
              : null,
            log: execution.error,
          },
        });
        return;
      }
      for (const row of current.rows) {
        const facet = facets.find(
          (candidate) => candidate.facetVersionId === row.facetVersionId,
        )!;
        const completed =
          facet.outcome !== "pending" && facet.outcome !== "failed";
        const failed =
          !completed &&
          (facet.outcome === "failed" || execution.status === "failed");
        const terminal = completed || failed;
        let status = execution.status === "queued" ? "pending" : "running";
        let phase = execution.phase;
        if (completed) {
          status = "completed";
          phase = facet.outcome;
        } else if (failed) {
          status = "failed";
          phase = "failed";
        }
        await tx.topicClusteringRun.update({
          where: { projectId_id: { projectId, id: row.id } },
          data: {
            executionMetadata: json({
              ...metadata(row),
              header,
              ...(progressVersion === undefined ? {} : { progressVersion }),
              facet,
            } satisfies RunMetadata),
            ...(!row.publishedAt
              ? {
                  status,
                  phase,
                  error: completed ? null : (facet.error ?? execution.error),
                  ...(execution.status === "running" && !row.startedAt
                    ? { startedAt: new Date() }
                    : {}),
                  finishedAt: terminal ? (row.finishedAt ?? new Date()) : null,
                }
              : {}),
          },
        });
      }
    });
  }
}

export const createTopicExecution = (
  input: TopicExecutionInput,
  requestHash?: string,
  userId?: string,
) => new TopicExecutionStore().create(input, requestHash, userId);
export const readTopicExecutionForRequest = (
  projectId: string,
  requestId: string,
  requestHash: string,
) =>
  new TopicExecutionStore().readForRequest(projectId, requestId, requestHash);
export const readTopicExecutionSummary = (projectId: string, id: string) =>
  new TopicExecutionStore().readSummary(projectId, id);
export const listTopicExecutions = (projectId: string) =>
  new TopicExecutionStore().list(projectId);
export const writeTopicExecution = (
  execution: TopicExecutionSummary,
  progressVersion?: number,
) => new TopicExecutionStore().write(execution, progressVersion);
