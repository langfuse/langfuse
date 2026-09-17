import { createHash } from "node:crypto";
import { prisma, type Prisma } from "../../db";
import { env } from "../../env";
import { InvalidRequestError } from "../../errors";
import {
  topicExecutionInputSchema,
  topicIdSchema,
  type TopicExecution,
  type TopicExecutionInput,
  type TopicFacetProgress,
} from "../../topics";
import { getS3EventStorageClient } from "../s3";

const MANIFEST_CHUNK_SIZE = 1000;
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
  inputManifest: ObjectReference;
  inputHash: string;
  requestHash: string;
  selectedTraceCount: number;
  progressManifest: ObjectReference | null;
  facet: Omit<TopicFacetProgress, "summaryIds">;
  artifacts: Record<string, ObjectReference>;
};
type RunRow = Prisma.TopicClusteringRunGetPayload<object>;

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const executionIdForRequest = (projectId: string, requestId: string) =>
  createHash("sha256")
    .update(`${projectId}:${requestId}`)
    .digest("hex")
    .slice(0, 32);
const metadata = (row: RunRow) =>
  row.executionMetadata as unknown as ExecutionMetadata;
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

function checkRequest(row: RunRow, input: TopicExecutionInput) {
  if (metadata(row).inputHash !== hash(input))
    throw new InvalidRequestError(
      "This request ID already belongs to a different Topics request.",
    );
}

/** Postgres owns execution progress; object storage holds immutable input and cohort references. */
export class TopicExecutionStore {
  async create(
    rawInput: TopicExecutionInput,
    originalRequestHash?: string,
  ): Promise<TopicExecution> {
    const input = topicExecutionInputSchema.parse(rawInput);
    input.facetVersionIds = [...new Set(input.facetVersionIds)];
    if (input.operation !== "recluster")
      input.traceIds = [...new Set(input.traceIds)];
    const id = executionIdForRequest(input.projectId, input.requestId);
    const requestHash = originalRequestHash ?? hash(input);
    const checkOriginalRequest = (row: RunRow) => {
      if (metadata(row).requestHash !== requestHash)
        throw new InvalidRequestError(
          "This request ID already belongs to a different Topics request.",
        );
    };
    const existing = await executionRows(input.projectId, id);
    if (existing.length) {
      checkOriginalRequest(existing[0]);
      return (await this.read(input.projectId, id))!;
    }
    const { projectId } = input;
    const { ids, settings } =
      input.operation === "recluster"
        ? {
            ids: input.sourceExecutionIds,
            settings: { ...input, sourceExecutionIds: undefined },
          }
        : { ids: input.traceIds, settings: { ...input, traceIds: undefined } };
    const inputManifest = await writeObject(projectId, id, {
      settings,
      ids: await writeChunks(projectId, id, ids),
    } satisfies InputManifest);
    await prisma.$transaction(async (tx) => {
      await lockExecution(tx, projectId, id);
      const current = await executionRows(projectId, id, tx);
      if (current.length) {
        checkOriginalRequest(current[0]);
        return;
      }
      const [sequence] = await tx.$queryRaw<
        { revision: bigint }[]
      >`SELECT nextval('topic_processing_revision_seq') AS revision`;
      const now = new Date().toISOString();
      const header: ExecutionMetadata["header"] = {
        id,
        projectId,
        revision: sequence.revision.toString(),
        status: "queued",
        phase: "queued",
        createdAt: now,
        updatedAt: now,
        error: null,
      };
      const requested =
        input.operation === "recluster" ? 0 : input.traceIds.length;
      await tx.topicClusteringRun.createMany({
        data: input.facetVersionIds.map((facetVersionId) => ({
          id: hash([id, facetVersionId, "run"]).slice(0, 48),
          projectId,
          executionId: id,
          facetVersionId,
          status: "pending",
          phase: "queued",
          executionMetadata: json({
            header,
            inputManifest,
            inputHash: hash(input),
            requestHash,
            selectedTraceCount: requested,
            progressManifest: null,
            artifacts: {},
            facet: {
              facetVersionId,
              outcome: "pending",
              runId: null,
              error: null,
              counts: {
                requested,
                complete: 0,
                nonApplicable: 0,
                insufficientInput: 0,
                failed: 0,
                assigned: 0,
                outlier: 0,
              },
            },
          } satisfies ExecutionMetadata),
        })),
      });
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
    const [row] = await executionRows(projectId, id);
    if (!row) return null;
    if (metadata(row).requestHash !== requestHash)
      throw new InvalidRequestError(
        "This request ID already belongs to a different Topics request.",
      );
    return this.read(projectId, id);
  }

  async read(
    projectId: string,
    executionId: string,
  ): Promise<TopicExecution | null> {
    const rows = await executionRows(projectId, executionId);
    if (!rows.length) return null;
    const state = metadata(rows[0]);
    const manifest = await readObject<InputManifest>(
      projectId,
      executionId,
      state.inputManifest,
    );
    const ids = await readChunks<string>(projectId, executionId, manifest.ids);
    const input = topicExecutionInputSchema.parse({
      ...manifest.settings,
      ...(manifest.settings.operation === "recluster"
        ? { sourceExecutionIds: ids }
        : { traceIds: ids }),
    });
    checkRequest(rows[0], input);
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
    for (const facetVersionId of input.facetVersionIds) {
      const row = rows.find(
        (candidate) => candidate.facetVersionId === facetVersionId,
      );
      if (!row)
        throw new Error("Topics execution is missing a selected facet.");
      facets.push({
        ...metadata(row).facet,
        summaryIds: await readChunks<string>(
          projectId,
          executionId,
          progress?.facets.find(
            (facet) => facet.facetVersionId === facetVersionId,
          )?.summaryIds ?? [],
        ),
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

  async list(projectId: string): Promise<TopicExecution[]> {
    topicIdSchema.parse(projectId);
    const rows = await prisma.topicClusteringRun.findMany({
      where: { projectId },
      distinct: ["executionId"],
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { executionId: true },
    });
    const executions: TopicExecution[] = [];
    for (const row of rows) {
      const execution = await this.read(projectId, row.executionId);
      if (execution) executions.push(execution);
    }
    return executions;
  }

  async write(execution: TopicExecution): Promise<void> {
    const { projectId, id } = execution;
    const [existing] = await executionRows(projectId, id);
    if (!existing) throw new Error("Topics execution does not exist.");
    checkRequest(existing, execution.input);
    const previousReference = metadata(existing).progressManifest;
    const previous = previousReference
      ? await readObject<ProgressManifest>(projectId, id, previousReference)
      : null;
    const progress: ProgressManifest = { facets: [], traceErrors: [] };
    for (const facet of execution.facets)
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
      const rows = await executionRows(projectId, id, tx);
      if (!rows.length) throw new Error("Topics execution does not exist.");
      checkRequest(rows[0], execution.input);
      if (metadata(rows[0]).header.revision !== execution.revision)
        throw new Error("Topics execution revision cannot change.");
      if (
        rows.length !== execution.facets.length ||
        rows.some(
          (row) =>
            !execution.facets.some(
              (facet) => facet.facetVersionId === row.facetVersionId,
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
      for (const row of rows) {
        const { summaryIds: _ids, ...facet } = execution.facets.find(
          (candidate) => candidate.facetVersionId === row.facetVersionId,
        )!;
        const completed =
          facet.outcome !== "pending" && facet.outcome !== "failed";
        const failed =
          !completed &&
          (facet.outcome === "failed" || execution.status === "failed");
        const terminal = completed || failed;
        await tx.topicClusteringRun.update({
          where: { projectId_id: { projectId, id: row.id } },
          data: {
            executionMetadata: json({
              ...metadata(row),
              header: { ...header, updatedAt: new Date().toISOString() },
              progressManifest,
              facet,
            } satisfies ExecutionMetadata),
            ...(!row.publishedAt
              ? {
                  status: failed
                    ? "failed"
                    : terminal
                      ? "completed"
                      : execution.status === "queued"
                        ? "pending"
                        : "running",
                  phase: completed
                    ? facet.outcome
                    : failed
                      ? "failed"
                      : execution.phase,
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
    const [row] = await executionRows(projectId, executionId);
    const reference = row ? metadata(row).artifacts[key] : null;
    return reference ? readObject<T>(projectId, executionId, reference) : null;
  }

  async writeArtifact(
    projectId: string,
    executionId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    topicIdSchema.parse(key);
    if (
      !/^(numeric|cohort|manifest|baseline|refresh-cohort|refresh-decision)-/.test(
        key,
      )
    )
      throw new Error(
        "Only cohort references and numerical results are Topics artifacts.",
      );
    const reference = await writeObject(projectId, executionId, value);
    await prisma.$transaction(async (tx) => {
      await lockExecution(tx, projectId, executionId);
      const [row] = await executionRows(projectId, executionId, tx);
      if (!row) throw new Error("Topics execution does not exist.");
      const state = metadata(row);
      const existing = state.artifacts[key];
      if (existing) {
        if (existing.hash !== reference.hash)
          throw new Error("An accepted Topics artifact cannot be replaced.");
        return;
      }
      await tx.topicClusteringRun.update({
        where: { projectId_id: { projectId, id: row.id } },
        data: {
          executionMetadata: json({
            ...state,
            artifacts: { ...state.artifacts, [key]: reference },
          }),
        },
      });
    });
  }
}

export const createTopicExecution = (
  input: TopicExecutionInput,
  requestHash?: string,
) => new TopicExecutionStore().create(input, requestHash);
export const readTopicExecutionForRequest = (
  projectId: string,
  requestId: string,
  requestHash: string,
) =>
  new TopicExecutionStore().readForRequest(projectId, requestId, requestHash);
export const readTopicExecution = (projectId: string, id: string) =>
  new TopicExecutionStore().read(projectId, id);
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
