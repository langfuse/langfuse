import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { QueueJobs, QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis, redis } from "../redis/redis";
import { logger } from "../logger";
import { isTopicsEnabled } from "./config";
import { readTopicExecutionSummary, writeTopicExecution } from "./journal";
import type {
  TopicOperation,
  TopicProcessBatchState,
  TopicFacetProgress,
} from "../../topics";

export const TOPICS_TRACE_BATCH_SIZE = 100;
const RETENTION_SECONDS = 7 * 86400;
const ownsExecution = (state: string) =>
  ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(
    state,
  );
type TopicsJob = TQueueJobTypes[QueueName.Topics];
const batchJobId = (executionId: string, index: number) =>
  `${executionId}-${index}`;
const progressKeys = (projectId: string, executionId: string) => {
  const scope = createHash("sha256")
    .update(JSON.stringify([projectId, executionId]))
    .digest("hex");
  return [
    `topics:progress:{${scope}}:batches`,
    `topics:progress:{${scope}}:totals`,
  ];
};
const expiredInput = () =>
  new Error(
    "Topics batch inputs or retry state expired. Start a new execution with your trace selection.",
  );

function createTopicsQueue(
  queueName: QueueName.Topics | QueueName.TopicsUpdate,
): Queue<TopicsJob> | null {
  const options = createBullMQQueueOptionsWithRedis(queueName);
  if (!options) return null;
  const queue = new Queue<TopicsJob>(queueName, {
    ...options,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: RETENTION_SECONDS, count: 1000 },
    },
  });
  queue.on("error", (error) => logger.error(`${queueName} queue error`, error));
  return queue;
}
export class TopicsQueue {
  private static instance: Queue<TopicsJob> | null = null;
  static getInstance(): Queue<TopicsJob> | null {
    if (!isTopicsEnabled()) return null;
    if (!this.instance) this.instance = createTopicsQueue(QueueName.Topics);
    return this.instance;
  }
}
export class TopicsUpdateQueue {
  private static instance: Queue<TopicsJob> | null = null;
  static getInstance(): Queue<TopicsJob> | null {
    if (!isTopicsEnabled()) return null;
    if (!this.instance)
      this.instance = createTopicsQueue(QueueName.TopicsUpdate);
    return this.instance;
  }
}
const executionQueue = (operation: TopicOperation) =>
  operation === "process"
    ? TopicsQueue.getInstance()
    : TopicsUpdateQueue.getInstance();

export async function getTopicExecutionQueueState(
  projectId: string,
  executionId: string,
  operation: TopicOperation,
) {
  const queue = executionQueue(operation);
  if (!queue)
    throw new Error("Topics requires the local development server and Redis.");
  let jobId = executionId;
  if (operation === "process") {
    const execution = await readTopicExecutionSummary(projectId, executionId);
    if (!execution) return "missing" as const;
    if (execution.status === "failed") return "failed" as const;
    if (
      execution.status === "completed" ||
      execution.status === "completed_with_errors"
    )
      return "completed" as const;
    const [, totalsKey] = progressKeys(projectId, executionId);
    const cursor = await redis?.hget(totalsKey, "next");
    if (execution.status !== "queued" && cursor === null)
      return "missing" as const;
    const count = Math.ceil(
      execution.facets[0].counts.requested / TOPICS_TRACE_BATCH_SIZE,
    );
    const index = Math.min(Number(cursor ?? 0), count - 1);
    jobId = batchJobId(executionId, index);
  }
  const job = await queue.getJob(jobId);
  if (
    !job ||
    job.data.payload.projectId !== projectId ||
    job.data.payload.executionId !== executionId
  )
    return "missing" as const;
  return job.getState();
}

export async function enqueueTopicExecution(
  projectId: string,
  executionId: string,
  operation: TopicOperation,
  traceIds?: string[],
): Promise<void> {
  const queue = executionQueue(operation);
  if (!queue)
    throw new Error("Topics requires the local development server and Redis.");
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!execution || execution.input.operation !== operation)
    throw new Error("Topics execution scope mismatch.");
  if (
    execution.status === "completed" ||
    (execution.status === "completed_with_errors" &&
      !execution.facets.some(
        (facet) => facet.outcome === "pending" || facet.outcome === "failed",
      ))
  )
    return;
  const count =
    operation === "process"
      ? Math.ceil(
          execution.facets[0].counts.requested / TOPICS_TRACE_BATCH_SIZE,
        )
      : 1;
  if (traceIds && traceIds.length !== execution.facets[0].counts.requested)
    throw new Error("Topics trace selection changed.");
  if (
    operation === "process" &&
    execution.status !== "queued" &&
    redis &&
    (await redis.exists(...progressKeys(projectId, executionId))) !== 2
  )
    throw expiredInput();
  for (let index = 0; index < count; index++) {
    const id =
      operation === "process" ? batchJobId(executionId, index) : executionId;
    const job = await queue.getJob(id);
    if (job) {
      if (
        job.data.payload.projectId !== projectId ||
        job.data.payload.executionId !== executionId
      )
        throw new Error("Topics queue job scope mismatch.");
      if (
        traceIds &&
        JSON.stringify(job.data.payload.traceIds) !==
          JSON.stringify(
            traceIds.slice(
              index * TOPICS_TRACE_BATCH_SIZE,
              (index + 1) * TOPICS_TRACE_BATCH_SIZE,
            ),
          )
      )
        throw new Error("Topics trace selection changed.");
      const state = await job.getState();
      if (ownsExecution(state)) continue;
      if (operation === "process" && state === "completed") {
        if (job.data.batchState)
          await recordTopicProcessBatchProgress(
            String(index),
            job.data.batchState,
          );
        continue;
      }
      if (state !== "failed" && state !== "completed")
        throw new Error("Topics queue job is not ready to resume.");
      try {
        await job.retry(state);
      } catch (error) {
        if (!ownsExecution(await job.getState())) throw error;
      }
      continue;
    }
    if (operation === "process") {
      const accepted = await redis?.hget(
        progressKeys(projectId, executionId)[0],
        String(index),
      );
      if (accepted) {
        const counts = JSON.parse(accepted) as {
          finished: number;
          failed: number;
        };
        if (counts.finished === 1 && counts.failed === 0) continue;
      }
      if (!traceIds) throw expiredInput();
    }
    await queue.add(
      QueueJobs.Topics,
      {
        id,
        name: QueueJobs.Topics,
        timestamp: new Date(),
        payload: {
          projectId,
          executionId,
          ...(operation === "process"
            ? {
                batchId: String(index),
                traceIds: traceIds!.slice(
                  index * TOPICS_TRACE_BATCH_SIZE,
                  (index + 1) * TOPICS_TRACE_BATCH_SIZE,
                ),
              }
            : {}),
        },
      },
      { jobId: id },
    );
  }
}

/** Delta aggregation is idempotent even when a batch is retried after acknowledging its results. */
export async function recordTopicProcessBatchProgress(
  batchId: string,
  state: TopicProcessBatchState,
): Promise<void> {
  if (!redis) throw new Error("Topics progress requires Redis.");
  const local = state.execution;
  const execution = await readTopicExecutionSummary(local.projectId, local.id);
  if (!execution || execution.input.operation !== "process")
    throw new Error("Topics execution scope mismatch.");
  if (
    !/^\d+$/.test(batchId) ||
    Number(batchId) >=
      Math.ceil(execution.facets[0].counts.requested / TOPICS_TRACE_BATCH_SIZE)
  )
    throw new Error("Topics batch does not belong to this execution.");
  const terminal = !["queued", "running"].includes(local.status);
  const values: Record<string, number> = {
    finished: Number(terminal),
    failed: Number(
      local.status === "failed" ||
        local.facets.some((facet) => facet.outcome === "failed"),
    ),
  };
  for (const facet of local.facets) {
    for (const [name, value] of Object.entries(facet.counts))
      values[`${JSON.stringify([facet.facetId, facet.facetVersion])}:${name}`] =
        value;
    values[
      `${JSON.stringify([facet.facetId, facet.facetVersion])}:outcome:${facet.outcome}`
    ] = 1;
  }
  const keys = progressKeys(local.projectId, local.id);
  if (execution.status !== "queued" && (await redis.exists(...keys)) !== 2)
    throw expiredInput();
  const flat = (await redis.eval(
    `
    local before = redis.call('HGET', KEYS[1], ARGV[1])
    local next = cjson.decode(ARGV[2])
    local previous = before and cjson.decode(before) or {}
    for key, value in pairs(previous) do
      if next[key] == nil then redis.call('HINCRBY', KEYS[2], key, -value) end
    end
    for key, value in pairs(next) do
      redis.call('HINCRBY', KEYS[2], key, value - (previous[key] or 0))
    end
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    local cursor = tonumber(redis.call('HGET', KEYS[2], 'next') or '0')
    if next.finished == 0 then cursor = math.min(cursor, tonumber(ARGV[1])) end
    while true do
      local item = redis.call('HGET', KEYS[1], tostring(cursor))
      if not item or cjson.decode(item).finished ~= 1 then break end
      cursor = cursor + 1
    end
    redis.call('HSET', KEYS[2], 'next', cursor)
    redis.call('HINCRBY', KEYS[2], 'version', 1)
    redis.call('EXPIRE', KEYS[1], ARGV[3])
    redis.call('EXPIRE', KEYS[2], ARGV[3])
    return redis.call('HGETALL', KEYS[2])
  `,
    2,
    ...keys,
    batchId,
    JSON.stringify(values),
    RETENTION_SECONDS,
  )) as string[];
  const totals = new Map<string, number>();
  for (let i = 0; i < flat.length; i += 2)
    totals.set(flat[i], Number(flat[i + 1]));
  const count = Math.ceil(
    execution.facets[0].counts.requested / TOPICS_TRACE_BATCH_SIZE,
  );
  const done = (totals.get("finished") ?? 0) >= count;
  const failed = (totals.get("failed") ?? 0) > 0;
  execution.facets = execution.facets.map((facet) => {
    const prefix = `${JSON.stringify([facet.facetId, facet.facetVersion])}:`;
    const counts = { ...facet.counts };
    for (const name of Object.keys(
      counts,
    ) as (keyof TopicFacetProgress["counts"])[]) {
      if (name !== "requested") counts[name] = totals.get(prefix + name) ?? 0;
    }
    let outcome: TopicFacetProgress["outcome"] = "pending";
    if (done) {
      outcome = "no_applicable_summaries";
      for (const candidate of [
        "failed",
        "assigned",
        "awaiting_topics",
      ] as const) {
        if ((totals.get(prefix + "outcome:" + candidate) ?? 0) > 0) {
          outcome = candidate;
          break;
        }
      }
    }
    return {
      ...facet,
      counts,
      outcome,
      error:
        done && !failed
          ? null
          : (local.facets.find(
              (item) =>
                item.facetId === facet.facetId &&
                item.facetVersion === facet.facetVersion,
            )?.error ?? facet.error),
    };
  });
  execution.status = "running";
  if (done) {
    execution.status = "completed";
    if (failed) execution.status = "failed";
    else if (execution.facets.some((facet) => facet.counts.failed > 0))
      execution.status = "completed_with_errors";
  }
  execution.phase = done ? execution.status : local.phase;
  execution.error = failed ? (local.error ?? execution.error) : null;
  await writeTopicExecution(execution, totals.get("version"));
}

/** Error details have the queue's retention; counts remain in Postgres. */
export async function readTopicExecutionTraceErrors(
  projectId: string,
  executionId: string,
) {
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!execution) throw new Error("Topics execution not found.");
  const errors: { traceId: string; error: string }[] = [];
  if (execution.input.operation !== "process")
    return { errors, expired: false };
  const queue = TopicsQueue.getInstance();
  if (!queue) throw new Error("Topics progress requires Redis.");
  let expired = false;
  const count = Math.ceil(
    execution.facets[0].counts.requested / TOPICS_TRACE_BATCH_SIZE,
  );
  for (let index = 0; index < count; index++) {
    const job = await queue.getJob(batchJobId(executionId, index));
    if (!job) {
      expired = true;
      continue;
    }
    if (
      job.data.payload.projectId !== projectId ||
      job.data.payload.executionId !== executionId
    )
      throw new Error("Topics queue job scope mismatch.");
    errors.push(...(job.data.batchState?.execution.traceErrors ?? []));
  }
  return { errors, expired };
}
