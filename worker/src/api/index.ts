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

    const events = eventBody.parse(body);

    const jobs = events.map((event) => ({
      name: QueueJobs.TraceUpsert,
      data: {
        payload: {
          projectId: event.projectId,
          traceId: event.traceId,
        },
        id: randomUUID(),
        timestamp: new Date(),
        name: QueueJobs.TraceUpsert as const,
      },
      opts: {
        removeOnFail: 10_000,
        removeOnComplete: true,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    }));

    await evalQueue?.addBulk(jobs); // add all jobs as bulk

    res.json({
      status: "success",
    });
  });

router.use("/emojis", emojis);

export default router;
