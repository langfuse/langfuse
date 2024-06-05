import express from "express";
import emojis from "./emojis";
import { z } from "zod";
import logger from "../logger";
import { Queue } from "bullmq";
import { redis } from "../redis/redis";
import { randomUUID } from "crypto";
import basicAuth from "express-basic-auth";
import { env } from "../env";
import { QueueJobs, QueueName, TQueueJobTypes } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { ingestionBatchEvent } from "@langfuse/shared/backend";
import { processEvents } from "./ingestion-service";

const router = express.Router();

export const evalQueue = redis
  ? new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(QueueName.TraceUpsert, {
      connection: redis,
    })
  : null;

const eventBody = z.array(
  z.object({
    traceId: z.string(),
    projectId: z.string(),
  })
);

type EventsResponse = {
  status: "success" | "error";
};

router.get<{}, { status: string }>("/health", async (_req, res) => {
  try {
    //check database health
    await prisma.$queryRaw`SELECT 1;`;

    if (!redis) {
      throw new Error("Redis connection not available");
    }

    await Promise.race([
      redis?.ping(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis ping timeout after 2 seconds")),
          2000
        )
      ),
    ]);

    res.json({
      status: "ok",
    });
  } catch (e) {
    logger.error(e, "Health check failed");
    res.status(500).json({
      status: "error",
    });
  }
});

router
  .use(
    basicAuth({
      users: { admin: env.LANGFUSE_WORKER_PASSWORD },
    })
  )
  .post<{}, EventsResponse>("/events", async (req, res) => {
    const { body } = req;
    logger.debug(`Received events, ${JSON.stringify(body)}`);

    const events = eventBody.parse(body);

    // Find set of traces per project. There might be two events for the same trace in one API call.
    // If we don't deduplicate, we will end up processing the same trace twice on two different workers in parallel.
    const jobs = createRedisEvents(events);

    await evalQueue?.addBulk(jobs); // add all jobs as bulk

    res.json({
      status: "success",
    });
  });
router.post<{}, EventsResponse>("/ingestion", async (req, res) => {
  try {
    const { body } = req;
    logger.debug(`Received events, ${JSON.stringify(body)}`);

    const events = ingestionBatchEvent.safeParse(body);

    if (!events.success) {
      logger.error(events.error, "Failed to parse ingestion event");
      return res.status(400).json({
        status: "error",
      });
    }

    await processEvents(events.data);
    res.json({
      status: "success",
    });
  } catch (e) {
    logger.error(e, "Failed to process ingestion event");
    return res.status(500).json({
      status: "error",
    });
  }
});

router.use("/emojis", emojis);

export default router;

export function createRedisEvents(events: z.infer<typeof eventBody>) {
  const uniqueTracesPerProject = events.reduce((acc, event) => {
    if (!acc.get(event.projectId)) {
      acc.set(event.projectId, new Set());
    }
    acc.get(event.projectId)?.add(event.traceId);
    return acc;
  }, new Map<string, Set<string>>());

  const jobs = [...uniqueTracesPerProject.entries()]
    .map((tracesPerProject) => {
      const [projectId, traceIds] = tracesPerProject;

      return [...traceIds].map((traceId) => ({
        name: QueueJobs.TraceUpsert,
        data: {
          payload: {
            projectId,
            traceId,
          },
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.TraceUpsert as const,
        },
        opts: {
          removeOnFail: 10000,
          removeOnComplete: true,
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        },
      }));
    })
    .flat();
  return jobs;
}
