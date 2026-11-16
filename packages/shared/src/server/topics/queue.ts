import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { QueueJobs, QueueName, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "../redis/redis";
import { logger } from "../logger";
import { isTopicsEnabled } from "./config";
import { readTopicExecutionSummary } from "./execution-store";
import type { TopicExecutionSummary } from "../../topics";

const RETENTION_SECONDS = 7 * 86400;
const ownsExecution = (state: string) =>
  ["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(
    state,
  );
type TopicsUpdateJob = TQueueJobTypes[QueueName.TopicsUpdate];
type TopicsSetupJob = TQueueJobTypes[QueueName.TopicsSetup];

function createTopicsQueue<Job extends TopicsUpdateJob | TopicsSetupJob>(
  queueName: QueueName.TopicsUpdate | QueueName.TopicsSetup,
): Queue<Job> | null {
  const options = createBullMQQueueOptionsWithRedis(queueName);
  if (!options) return null;
  const queue = new Queue<Job>(queueName, {
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
export class TopicsUpdateQueue {
  private static instance: Queue<TopicsUpdateJob> | null = null;
  static getInstance(): Queue<TopicsUpdateJob> | null {
    if (!isTopicsEnabled()) return null;
    if (!this.instance)
      this.instance = createTopicsQueue(QueueName.TopicsUpdate);
    return this.instance;
  }
}
/** The clock of rule setups; each job delays itself while its setup runs. */
export class TopicsSetupQueue {
  private static instance: Queue<TopicsSetupJob> | null = null;
  static getInstance(): Queue<TopicsSetupJob> | null {
    if (!isTopicsEnabled()) return null;
    if (!this.instance)
      this.instance = createTopicsQueue(QueueName.TopicsSetup);
    return this.instance;
  }
}

/** Idempotent per run: the job ID is the run ID. A priority runs after unprioritized jobs. */
export async function enqueueTopicRuleRefit(
  projectId: string,
  runId: string,
  priority?: number,
): Promise<void> {
  const queue = TopicsUpdateQueue.getInstance();
  if (!queue) throw new Error("Topics rule refits require the update queue.");
  await queue.add(
    QueueJobs.TopicsRuleRefit,
    {
      id: runId,
      timestamp: new Date(),
      name: QueueJobs.TopicsRuleRefit,
      payload: { projectId, runId },
    },
    { jobId: runId, priority },
  );
}

/** Idempotent per setup: the job ID derives from the rule and the setup's start. */
export async function enqueueTopicRuleSetup(
  projectId: string,
  ruleId: string,
  startedAt: string,
): Promise<void> {
  const queue = TopicsSetupQueue.getInstance();
  if (!queue) throw new Error("Topics setup requires Redis.");
  const id = createHash("sha256")
    .update(JSON.stringify([projectId, ruleId, startedAt]))
    .digest("hex");
  await queue.add(
    QueueJobs.TopicsSetup,
    {
      id,
      timestamp: new Date(),
      name: QueueJobs.TopicsSetup,
      payload: { projectId, ruleId },
    },
    { jobId: id },
  );
}

const snapshotSetupJobId = (projectId: string, executionId: string) =>
  createHash("sha256")
    .update(JSON.stringify([projectId, executionId, "snapshot-setup"]))
    .digest("hex");

/** Idempotent per snapshot: summarizes its traces, then enqueues its update. */
export async function enqueueTopicSnapshotSetup(
  projectId: string,
  executionId: string,
): Promise<void> {
  const queue = TopicsSetupQueue.getInstance();
  if (!queue) throw new Error("Topics setup requires Redis.");
  const id = snapshotSetupJobId(projectId, executionId);
  // A resume reuses the ID; a finished earlier job would make the add a no-op.
  const previous = await queue.getJob(id);
  if (
    previous &&
    ((await previous.isCompleted()) || (await previous.isFailed()))
  )
    await previous.remove();
  await queue.add(
    QueueJobs.TopicsSetup,
    {
      id,
      timestamp: new Date(),
      name: QueueJobs.TopicsSetup,
      payload: { projectId, executionId },
    },
    { jobId: id },
  );
}

export async function getTopicExecutionQueueState(
  execution: TopicExecutionSummary,
) {
  const { projectId, id: executionId } = execution;
  // Manual process runs had their own queue, which no longer exists.
  if (execution.input.operation === "process") return "missing" as const;
  // A snapshot summarizing first has only its setup job until the fit is enqueued.
  if (execution.phase === "summarizing") {
    const job = await TopicsSetupQueue.getInstance()?.getJob(
      snapshotSetupJobId(projectId, executionId),
    );
    return job ? job.getState() : ("missing" as const);
  }
  const queue = TopicsUpdateQueue.getInstance();
  if (!queue)
    throw new Error("Topics requires the local development server and Redis.");
  const job = await queue.getJob(executionId);
  if (
    !job ||
    job.data.payload.projectId !== projectId ||
    !("executionId" in job.data.payload) ||
    job.data.payload.executionId !== executionId
  )
    return "missing" as const;
  return job.getState();
}

/** Idempotent per execution: the job ID is the execution ID. */
export async function enqueueTopicExecution(
  projectId: string,
  executionId: string,
): Promise<void> {
  const execution = await readTopicExecutionSummary(projectId, executionId);
  if (!execution) throw new Error("Topics execution scope mismatch.");
  if (execution.input.operation === "process")
    throw new Error("Manual Topics runs can no longer be started or resumed.");
  const queue = TopicsUpdateQueue.getInstance();
  if (!queue)
    throw new Error("Topics requires the local development server and Redis.");
  if (
    execution.status === "completed" ||
    (execution.status === "completed_with_errors" &&
      !execution.facets.some(
        (facet) => facet.outcome === "pending" || facet.outcome === "failed",
      ))
  )
    return;
  const job = await queue.getJob(executionId);
  if (job) {
    if (
      job.data.payload.projectId !== projectId ||
      !("executionId" in job.data.payload) ||
      job.data.payload.executionId !== executionId
    )
      throw new Error("Topics queue job scope mismatch.");
    const state = await job.getState();
    if (ownsExecution(state)) return;
    if (state !== "failed" && state !== "completed")
      throw new Error("Topics queue job is not ready to resume.");
    try {
      await job.retry(state);
    } catch (error) {
      if (!ownsExecution(await job.getState())) throw error;
    }
    return;
  }
  await queue.add(
    QueueJobs.Topics,
    {
      id: executionId,
      name: QueueJobs.Topics,
      timestamp: new Date(),
      payload: { projectId, executionId },
    },
    { jobId: executionId },
  );
}
