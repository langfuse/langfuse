import express from "express";
import MessageResponse from "../interfaces/MessageResponse";
import emojis from "./emojis";
import { z } from "zod";
import logger from "../logger";
import { Queue } from "bullmq";
import { QueueJobs, QueueName, TQueueJobTypes } from "@langfuse/shared";
import { redis } from "../redis/consumer";
import { randomUUID } from "crypto";
import basicAuth from "express-basic-auth";
import { env } from "../env";

const router = express.Router();

router.use(
  basicAuth({
    users: { admin: env.WORKER_PASSWORD },
  })
);

export const evalQueue = new Queue<TQueueJobTypes[QueueName.Evaluation]>(
  QueueName.Evaluation,
  {
    connection: redis,
  }
);

const eventBody = z.array(
  z.object({
    traceId: z.string(),
    projectId: z.string(),
  })
);

router.post<{}, MessageResponse>("/events", async (req, res) => {
  const { body } = req;
  logger.info(`Received events, ${JSON.stringify(body)}`);

  const events = eventBody.parse(body);
  //{ name: string; data: { payload: { timestamp: string; id: string; data: { projectId: string; traceId: string; }; }; name: QueueJobs.Evaluation; }; opts?: BulkJobOptions | undefined; }
  const jobs = events.map((event) => ({
    name: QueueJobs.Evaluation,
    data: {
      payload: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          projectId: event.projectId,
          traceId: event.traceId,
        },
      },
      name: QueueJobs.Evaluation as const,
    },
  }));

  await evalQueue.addBulk(jobs);

  res.json({
    message: "API - 👋",
  });
});

router.use("/emojis", emojis);

export default router;
