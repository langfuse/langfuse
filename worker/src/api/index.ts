import express from "express";
import basicAuth from "express-basic-auth";
import * as Sentry from "@sentry/node";

import { EventBodySchema, EventName, QueueJobs } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "../env";
import logger from "../logger";
import { batchExportQueue } from "../queues/batchExportQueue";
import { redis } from "@langfuse/shared/src/server";
import emojis from "./emojis";
import { createRedisEvents, evalQueue } from "@langfuse/shared/src/server";

const router = express.Router();

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
    try {
      const { body } = req;
      logger.info(`Received events, ${JSON.stringify(body)}`);

      const event = EventBodySchema.safeParse(body);

      if (!event.success) {
        logger.error("Invalid event body", event.error);
        return res.status(400).json({
          status: "error",
        });
      }

      if (event.data.name === EventName.TraceUpsert) {
        // Find set of traces per project. There might be two events for the same trace in one API call.
        // If we don't deduplicate, we will end up processing the same trace twice on two different workers in parallel.
        const jobs = createRedisEvents(event.data.payload);
        await evalQueue?.addBulk(jobs); // add all jobs as bulk

        return res.json({
          status: "success",
        });
      }

      if (event.data.name === EventName.BatchExport) {
        await batchExportQueue?.add(event.data.name, {
          id: event.data.payload.batchExportId, // Use the batchExportId to deduplicate when the same job is sent multiple times
          name: QueueJobs.BatchExportJob,
          timestamp: new Date(),
          payload: event.data.payload,
        });

        return res.json({
          status: "success",
        });
      }

      return res.status(400);
    } catch (e) {
      logger.error(e, "Error processing events");
      Sentry.captureException(e);
      return res.status(500).json({
        status: "error",
      });
    }
  });

router.use("/emojis", emojis);

export default router;
