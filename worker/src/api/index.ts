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

export const evalQueue = new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(
  QueueName.TraceUpsert,
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

type EventsResponse = {
  status: "success";
};

router.post<{}, EventsResponse>("/events", async (req, res) => {
  const { body } = req;
  logger.info(`Received events, ${JSON.stringify(body)}`);

  const events = eventBody.parse(body);

  const jobs = events.map((event) => ({
    name: QueueJobs.TraceUpsert,
    data: {
      payload: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          projectId: event.projectId,
          traceId: event.traceId,
        },
      },
      name: QueueJobs.TraceUpsert as const,
    },
  }));

  await evalQueue.addBulk(jobs); // add all jobs as bulk

  res.json({
    status: "success",
  });
});

router.use("/emojis", emojis);

export default router;
