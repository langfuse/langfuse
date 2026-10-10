import { createHash, randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { prisma } from "../../db";
import { QueueJobs, QueueName, type TopicAutomaticJob } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "../redis/redis";
import { logger } from "../logger";
import { isTopicsEnabled, isTopicsProjectEnabled } from "./config";
import { TOPICS_TRACE_BATCH_SIZE } from "./queue";
import { topicExecutionIdForRequest } from "./execution-store";
import type {
  TopicEmbeddingConfig,
  TopicFacetRef,
  TopicTimeRange,
} from "../../topics";

export class AutomaticTopicsQueue {
  private static instance: Queue<TopicAutomaticJob> | null = null;

  static getInstance(): Queue<TopicAutomaticJob> | null {
    if (!isTopicsEnabled()) return null;
    if (!this.instance) {
      const options = createBullMQQueueOptionsWithRedis(QueueName.TopicsUpdate);
      if (!options) return null;
      this.instance = new Queue<TopicAutomaticJob>(QueueName.TopicsUpdate, {
        ...options,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 7 * 86400, count: 1000 },
        },
      });
      this.instance.on("error", (error) =>
        logger.error("Automatic Topics queue error", error),
      );
    }
    return this.instance;
  }
}

const currentWindow = () => {
  const to = new Date();
  return { from: new Date(to.getTime() - 7 * 86400000), to };
};

async function canAdmitAutomaticTopics(projectId: string): Promise<boolean> {
  if (isTopicsProjectEnabled(projectId)) return true;
  if (
    !(await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    }))
  )
    return false;
  throw new Error("Automatic Topics admission is disabled for this project.");
}

export async function enqueueAutomaticTopicAssignments(input: {
  projectId: string;
  traceIds: string[];
  batchId: string;
  timeRange?: TopicTimeRange;
  facets: TopicFacetRef[];
  embeddingConfig: TopicEmbeddingConfig;
}): Promise<void> {
  if (!input.traceIds.length) return;
  if (!(await canAdmitAutomaticTopics(input.projectId))) return;
  const queue = AutomaticTopicsQueue.getInstance();
  if (!queue) throw new Error("Automatic Topics requires Redis.");
  const traceIds = [...new Set(input.traceIds)];
  const timeRange = input.timeRange ?? currentWindow();
  for (
    let index = 0;
    index < traceIds.length;
    index += TOPICS_TRACE_BATCH_SIZE
  ) {
    const batch = traceIds.slice(index, index + TOPICS_TRACE_BATCH_SIZE);
    const id = createHash("sha256")
      .update(
        JSON.stringify([
          "topics-automatic",
          input.projectId,
          input.batchId,
          batch,
        ]),
      )
      .digest("hex");
    await queue.add(
      QueueJobs.TopicsAutomatic,
      {
        id,
        timestamp: new Date(),
        name: QueueJobs.TopicsAutomatic,
        payload: {
          projectId: input.projectId,
          traceIds: batch,
          timeRange,
          facets: input.facets,
          embeddingConfig: input.embeddingConfig,
        },
      },
      { jobId: id },
    );
  }
}

export async function enqueueAutomaticTopicDiscovery(
  projectId: string,
  facets: TopicFacetRef[],
): Promise<void> {
  if (!facets.length || !(await canAdmitAutomaticTopics(projectId))) return;
  const queue = AutomaticTopicsQueue.getInstance();
  if (!queue) throw new Error("Automatic Topics requires Redis.");
  for (const facet of new Map(
    facets.map((value) => [JSON.stringify(value), value]),
  ).values()) {
    const id = randomUUID();
    const executionId = topicExecutionIdForRequest(projectId, id);
    const scope = createHash("sha256")
      .update(JSON.stringify([projectId, facet.facetId, facet.version]))
      .digest("hex");
    await queue.add(
      QueueJobs.TopicsAutomatic,
      {
        id,
        timestamp: new Date(),
        name: QueueJobs.TopicsAutomatic,
        payload: {
          projectId,
          executionId,
          facets: [facet],
          timeRange: currentWindow(),
        },
      },
      {
        jobId: executionId,
        deduplication: {
          id: `topics-bootstrap-${scope}`,
          keepLastIfActive: true,
        },
      },
    );
  }
}
