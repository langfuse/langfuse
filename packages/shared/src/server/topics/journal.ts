import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../db";
import {
  topicExecutionInputSchema,
  topicIdSchema,
  type TopicExecution,
  type TopicExecutionInput,
} from "../../topics";

import { getTopicsArtifactRoot } from "./config";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function atomicJson(
  file: string,
  value: unknown,
  immutable = false,
): Promise<boolean> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (immutable) {
      try {
        await link(temporary, file);
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST"
        )
          return false;
        throw error;
      }
    } else {
      await rename(temporary, file);
    }
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Local web and a single Topics worker share this journal and artifact root. */
export class TopicExecutionStore {
  constructor(
    private readonly root: string,
    private readonly allocateRevision: () => Promise<string>,
  ) {}

  private directory(projectId: string, executionId: string): string {
    return path.join(
      this.root,
      topicIdSchema.parse(projectId),
      topicIdSchema.parse(executionId),
    );
  }

  async create(rawInput: TopicExecutionInput): Promise<TopicExecution> {
    const input = topicExecutionInputSchema.parse(rawInput);
    input.facetVersionIds = [...new Set(input.facetVersionIds)];
    if (input.operation !== "recluster")
      input.traceIds = [...new Set(input.traceIds)];
    const id = createHash("sha256")
      .update(`${input.projectId}:${input.requestId}`)
      .digest("hex")
      .slice(0, 32);
    const existing = await this.read(input.projectId, id);
    if (existing) return this.checkRequest(existing, input);
    const now = new Date().toISOString();
    const execution: TopicExecution = {
      id,
      projectId: input.projectId,
      revision: await this.allocateRevision(),
      input,
      status: "queued",
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      facets: input.facetVersionIds.map((facetVersionId) => ({
        facetVersionId,
        outcome: "pending",
        summaryIds: [],
        runId: null,
        error: null,
        counts: {
          requested:
            input.operation === "recluster" ? 0 : input.traceIds.length,
          complete: 0,
          nonApplicable: 0,
          insufficientInput: 0,
          failed: 0,
          assigned: 0,
          outlier: 0,
        },
      })),
      traceErrors: [],
      error: null,
    };
    const created = await atomicJson(
      path.join(this.directory(input.projectId, id), "execution.json"),
      execution,
      true,
    );
    if (created) return execution;
    const winner = await this.read(input.projectId, id);
    if (!winner)
      throw new Error("The Topics execution journal could not be read.");
    return this.checkRequest(winner, input);
  }

  private checkRequest(
    execution: TopicExecution,
    input: TopicExecutionInput,
  ): TopicExecution {
    if (JSON.stringify(execution.input) !== JSON.stringify(input)) {
      throw new Error(
        "This request ID already belongs to a different Topics request.",
      );
    }
    return execution;
  }

  async read(
    projectId: string,
    executionId: string,
  ): Promise<TopicExecution | null> {
    const result = await readJson<TopicExecution>(
      path.join(this.directory(projectId, executionId), "execution.json"),
    );
    if (result && (result.id !== executionId || result.projectId !== projectId))
      throw new Error("Topics execution scope mismatch.");
    if (result) result.input = topicExecutionInputSchema.parse(result.input);
    return result;
  }

  async list(projectId: string): Promise<TopicExecution[]> {
    const directory = path.join(this.root, topicIdSchema.parse(projectId));
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const executions = await Promise.all(
      entries
        .filter((entry) => topicIdSchema.safeParse(entry).success)
        .map((entry) => this.read(projectId, entry)),
    );
    return executions
      .filter((entry): entry is TopicExecution => entry !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  }

  async write(execution: TopicExecution): Promise<void> {
    const existing = await this.read(execution.projectId, execution.id);
    if (!existing) throw new Error("Topics execution does not exist.");
    this.checkRequest(existing, execution.input);
    if (existing.revision !== execution.revision)
      throw new Error("Topics execution revision cannot change.");
    await atomicJson(
      path.join(
        this.directory(execution.projectId, execution.id),
        "execution.json",
      ),
      { ...execution, updatedAt: new Date().toISOString() },
    );
  }

  async readArtifact<T>(
    projectId: string,
    executionId: string,
    key: string,
  ): Promise<T | null> {
    return readJson<T>(
      path.join(
        this.directory(projectId, executionId),
        `${topicIdSchema.parse(key)}.json`,
      ),
    );
  }

  async writeArtifact(
    projectId: string,
    executionId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    topicIdSchema.parse(key);
    if (key === "execution")
      throw new Error("Execution metadata is not an immutable artifact.");
    const file = path.join(
      this.directory(projectId, executionId),
      `${key}.json`,
    );
    const written = await atomicJson(file, value, true);
    if (
      !written &&
      JSON.stringify(await readJson(file)) !== JSON.stringify(value)
    ) {
      throw new Error("An accepted Topics artifact cannot be replaced.");
    }
  }

  async remove(projectId: string, executionId: string): Promise<void> {
    await rm(this.directory(projectId, executionId), {
      recursive: true,
      force: true,
    });
  }
}

function store(): TopicExecutionStore {
  return new TopicExecutionStore(getTopicsArtifactRoot(), async () => {
    const rows = await prisma.$queryRaw<
      { revision: bigint }[]
    >`SELECT nextval('topic_processing_revision_seq') AS revision`;
    return rows[0].revision.toString();
  });
}
export const createTopicExecution = (input: TopicExecutionInput) =>
  store().create(input);
export const readTopicExecution = (projectId: string, id: string) =>
  store().read(projectId, id);
export const listTopicExecutions = (projectId: string) =>
  store().list(projectId);
export const writeTopicExecution = (execution: TopicExecution) =>
  store().write(execution);
export const readTopicArtifact = <T>(
  projectId: string,
  executionId: string,
  key: string,
) => store().readArtifact<T>(projectId, executionId, key);
export const writeTopicArtifact = (
  projectId: string,
  executionId: string,
  key: string,
  value: unknown,
) => store().writeArtifact(projectId, executionId, key, value);
