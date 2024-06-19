import { Queue } from "bullmq";
import { randomUUID } from "crypto";
import express from "express";
import basicAuth from "express-basic-auth";

import {
  EventBodySchema,
  EventName,
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  TraceUpsertEventType,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "../env";
import logger from "../logger";
import { batchExportQueue } from "../queues/batchExportQueue";
import { redis } from "../redis";
import emojis from "./emojis";

const router = express.Router();

export const evalQueue = redis
  ? new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(QueueName.TraceUpsert, {
      connection: redis,
    })
  : null;

type EventsResponse = {
  status: "success";
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
    logger.info(`Received events, ${JSON.stringify(body)}`);

    const event = EventBodySchema.parse(body);

    if (event.name === EventName.TraceUpsert) {
      // Find set of traces per project. There might be two events for the same trace in one API call.
      // If we don't deduplicate, we will end up processing the same trace twice on two different workers in parallel.
      const jobs = createRedisEvents(event.payload);
      await evalQueue?.addBulk(jobs); // add all jobs as bulk

      return res.json({
        status: "success",
      });
    }

    if (event.name === EventName.BatchExport) {
      await batchExportQueue?.add(event.name, {
        id: event.payload.batchExportId, // Use the batchExportId to deduplicate when the same job is sent multiple times
        name: QueueJobs.BatchExportJob,
        timestamp: new Date(),
        payload: event.payload,
      });

      return res.json({
        status: "success",
      });
    }

    return res.status(400);
  });

router.use("/emojis", emojis);

export default router;

export function createRedisEvents(events: TraceUpsertEventType[]) {
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
