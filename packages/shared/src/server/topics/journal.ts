import { createHash } from "node:crypto";
import { prisma, type Prisma } from "../../db";
import { env } from "../../env";
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
import { getS3EventStorageClient } from "../s3";

const MANIFEST_CHUNK_SIZE = 1000;
export const TOPICS_PROCESS_TRACES_ACTION = "trace-process-topics";
type ObjectReference = { key: string; hash: string };
type InputManifest = {
  settings: Record<string, unknown>;
  ids: ObjectReference[];
};
type ProgressManifest = {
  facets: { facetVersionId: string; summaryIds: ObjectReference[] }[];
  traceErrors: ObjectReference[];
};
type ExecutionMetadata = {
  header: Omit<TopicExecution, "input" | "facets" | "traceErrors">;
  inputSettings: TopicExecutionSummary["input"];
  inputManifest: ObjectReference;
  inputHash: string;
  requestHash: string;
  progressManifest: ObjectReference | null;
  artifacts: Record<string, ObjectReference>;
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
const storage = () =>
  getS3EventStorageClient(env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET);

function objectKey(projectId: string, executionId: string, digest: string) {
  return `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}topics/${topicIdSchema.parse(projectId)}/${topicIdSchema.parse(executionId)}/${digest}.json`;
}

async function writeObject(
  projectId: string,
  executionId: string,
  value: unknown,
  previous?: ObjectReference | null,
): Promise<ObjectReference> {
  const body = { value };
  const digest = hash(body);
  const key = objectKey(projectId, executionId, digest);
  if (previous?.key === key && previous.hash === digest) return previous;
  await storage().uploadJson(key, body);
  return { key, hash: digest };
}

async function readObject<T>(
  projectId: string,
  executionId: string,
  reference: ObjectReference,
): Promise<T> {
  if (reference.key !== objectKey(projectId, executionId, reference.hash))
    throw new Error("Topics object scope mismatch.");
  const body = JSON.parse(await storage().download(reference.key));
  if (hash(body) !== reference.hash)
    throw new Error("Topics object does not match its accepted hash.");
  return body.value as T;
}

async function writeChunks<T>(
  projectId: string,
  executionId: string,
  values: T[],
  previous: ObjectReference[] = [],
) {
  const chunks: ObjectReference[] = [];
  for (let offset = 0; offset < values.length; offset += MANIFEST_CHUNK_SIZE)
    chunks.push(
      await writeObject(
        projectId,
        executionId,
        values.slice(offset, offset + MANIFEST_CHUNK_SIZE),
        previous[offset / MANIFEST_CHUNK_SIZE],
      ),
    );
  return chunks;
}

async function readChunks<T>(
  projectId: string,
  executionId: string,
  chunks: ObjectReference[],
) {
  const values: T[] = [];
  for (const reference of chunks)
    values.push(...(await readObject<T[]>(projectId, executionId, reference)));
  return values;
}

async function lockExecution(
  tx: Prisma.TransactionClient,
  projectId: string,
  executionId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`topics:${projectId}:${executionId}`}, 0))`;
  await tx.$queryRaw`SELECT id FROM topic_clustering_runs WHERE project_id = ${projectId} AND execution_id = ${executionId} ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM batch_actions WHERE project_id = ${projectId} AND id = ${executionId} FOR UPDATE`;
}

function executionRows(
  projectId: string,
  executionId: string,
  db: Pick<Prisma.TransactionClient, "topicClusteringRun"> = prisma,
) {
  topicIdSchema.parse(projectId);
  topicIdSchema.parse(executionId);
  return db.topicClusteringRun.findMany({
    where: { projectId, executionId },
    orderBy: { id: "asc" },
  });
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

/** Postgres owns execution progress; object storage holds immutable input and cohort references. */
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
      return (await this.read(input.projectId, id))!;
    }
    const { projectId } = input;
    const { ids, settings, inputSettings } =
      input.operation === "process"
        ? (() => {
            const { traceIds, traceSelection, ...compact } = input;
            return {
              ids: traceIds,
              settings: { ...compact, traceSelection },
              inputSettings: compact,
            };
          })()
        : { ids: [], settings: input, inputSettings: input };
    const inputManifest = await writeObject(projectId, id, {
      settings,
      ids: await writeChunks(projectId, id, ids),
    } satisfies InputManifest);
    await prisma.$transaction(async (tx) => {
      await lockExecution(tx, projectId, id);
      const current = await storedExecution(projectId, id, tx);
      if (current) {
        checkOriginalRequest(current.state);
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
        inputManifest,
        inputHash: hash(input),
        requestHash,
        progressManifest: null,
        artifacts: {},
      };
      const facets: FacetMetadata[] = input.facetVersionIds.map(
        (facetVersionId) => ({
          facetVersionId,
          outcome: "pending",
          runId: null,
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
            query: json({ inputManifest }),
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
    return (await this.read(projectId, id))!;
  }

  async readForRequest(
    projectId: string,
    requestId: string,
    requestHash: string,
  ): Promise<TopicExecution | null> {
    topicIdSchema.parse(requestId);
    const id = executionIdForRequest(projectId, requestId);
    const stored = await storedExecution(projectId, id);
    if (!stored) return null;
    if (stored.state.requestHash !== requestHash)
      throw new InvalidRequestError(
        "This request ID already belongs to a different Topics request.",
      );
    return this.read(projectId, id);
  }

  async readSummary(
    projectId: string,
    executionId: string,
  ): Promise<TopicExecutionSummary | null> {
    const stored = await storedExecution(projectId, executionId);
    return stored ? summaryResult(stored) : null;
  }

  async read(
    projectId: string,
    executionId: string,
  ): Promise<TopicExecution | null> {
    const stored = await storedExecution(projectId, executionId);
    if (!stored) return null;
    const { state } = stored;
    const manifest = await readObject<InputManifest>(
      projectId,
      executionId,
      state.inputManifest,
    );
    const input = topicExecutionInputSchema.parse({
      ...manifest.settings,
      ...(manifest.settings.operation === "process"
        ? {
            traceIds: await readChunks<string>(
              projectId,
              executionId,
              manifest.ids,
            ),
          }
        : {}),
    });
    checkRequest(state, input);
    if (
      state.header.id !== executionId ||
      state.header.projectId !== projectId ||
      input.projectId !== projectId
    )
      throw new Error("Topics execution scope mismatch.");
    const progress = state.progressManifest
      ? await readObject<ProgressManifest>(
          projectId,
          executionId,
          state.progressManifest,
        )
      : null;
    const facets: TopicFacetProgress[] = [];
    for (const facet of summaryResult(stored).facets) {
      const manifestPath = stored.rows.find(
        (row) => row.facetVersionId === facet.facetVersionId,
      )?.manifestPath;
      const cohort = manifestPath
        ? await readObject<{ summaryIds: string[] }>(
            projectId,
            executionId,
            state.artifacts[manifestPath],
          )
        : null;
      facets.push({
        ...facet,
        summaryIds:
          cohort?.summaryIds ??
          (await readChunks<string>(
            projectId,
            executionId,
            progress?.facets.find(
              (item) => item.facetVersionId === facet.facetVersionId,
            )?.summaryIds ?? [],
          )),
      });
    }
    return {
      ...state.header,
      input,
      facets,
      traceErrors: await readChunks<TopicExecution["traceErrors"][number]>(
        projectId,
        executionId,
        progress?.traceErrors ?? [],
      ),
    };
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
    for (const row of rows) {
      if (executions.has(row.executionId)) continue;
      executions.set(
        row.executionId,
        summaryResult({
          state: metadata(row),
          facets: rows
            .filter((candidate) => candidate.executionId === row.executionId)
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

  async write(execution: TopicExecution): Promise<void> {
    const { projectId, id } = execution;
    const existing = await storedExecution(projectId, id);
    if (!existing) throw new Error("Topics execution does not exist.");
    checkRequest(existing.state, execution.input);
    const previousReference = existing.state.progressManifest;
    const previous = previousReference
      ? await readObject<ProgressManifest>(projectId, id, previousReference)
      : null;
    const progress: ProgressManifest = { facets: [], traceErrors: [] };
    for (const facet of execution.input.operation === "process"
      ? execution.facets
      : [])
      progress.facets.push({
        facetVersionId: facet.facetVersionId,
        summaryIds: await writeChunks(
          projectId,
          id,
          facet.summaryIds,
          previous?.facets.find(
            (item) => item.facetVersionId === facet.facetVersionId,
          )?.summaryIds,
        ),
      });
    progress.traceErrors = await writeChunks(
      projectId,
      id,
      execution.traceErrors,
      previous?.traceErrors,
    );
    const progressManifest = await writeObject(
      projectId,
      id,
      progress,
      previousReference,
    );
    await prisma.$transaction(async (tx) => {
      await lockExecution(tx, projectId, id);
      const current = await storedExecution(projectId, id, tx);
      if (!current) throw new Error("Topics execution does not exist.");
      checkRequest(current.state, execution.input);
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
        input: _input,
        facets: _facets,
        traceErrors: _traceErrors,
        ...header
      } = execution;
      header.updatedAt = new Date().toISOString();
      const facets = execution.facets.map(
        ({ summaryIds: _ids, ...facet }) => facet,
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
              progressManifest,
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
              progressManifest,
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

  async readArtifact<T>(
    projectId: string,
    executionId: string,
    key: string,
  ): Promise<T | null> {
    topicIdSchema.parse(key);
    const stored = await storedExecution(projectId, executionId);
    const reference = stored?.state.artifacts[key];
    return reference ? readObject<T>(projectId, executionId, reference) : null;
  }

  async writeArtifact(
    projectId: string,
    executionId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    topicIdSchema.parse(key);
    if (!/^(numeric|cohort|baseline)-/.test(key))
      throw new Error(
        "Only cohort references and numerical results are Topics artifacts.",
      );
    const reference = await writeObject(projectId, executionId, value);
    await prisma.$transaction(async (tx) => {
      await lockExecution(tx, projectId, executionId);
      const current = await storedExecution(projectId, executionId, tx);
      if (!current) throw new Error("Topics execution does not exist.");
      const { state } = current;
      const existing = state.artifacts[key];
      if (existing) {
        if (existing.hash !== reference.hash)
          throw new Error("An accepted Topics artifact cannot be replaced.");
        return;
      }
      const artifacts = { ...state.artifacts, [key]: reference };
      if (current.batch) {
        await tx.batchAction.update({
          where: { projectId, id: executionId },
          data: {
            config: json({
              ...state,
              facets: current.facets,
              artifacts,
            } satisfies BatchMetadata),
          },
        });
      } else {
        const [row] = current.rows;
        await tx.topicClusteringRun.update({
          where: { projectId_id: { projectId, id: row.id } },
          data: { executionMetadata: json({ ...metadata(row), artifacts }) },
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
export const readTopicExecution = (projectId: string, id: string) =>
  new TopicExecutionStore().read(projectId, id);
export const readTopicExecutionSummary = (projectId: string, id: string) =>
  new TopicExecutionStore().readSummary(projectId, id);
export const listTopicExecutions = (projectId: string) =>
  new TopicExecutionStore().list(projectId);
export const writeTopicExecution = (execution: TopicExecution) =>
  new TopicExecutionStore().write(execution);
export const readTopicArtifact = <T>(
  projectId: string,
  executionId: string,
  key: string,
) => new TopicExecutionStore().readArtifact<T>(projectId, executionId, key);
export const writeTopicArtifact = (
  projectId: string,
  executionId: string,
  key: string,
  value: unknown,
) =>
  new TopicExecutionStore().writeArtifact(projectId, executionId, key, value);
