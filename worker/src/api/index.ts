import express from "express";
import basicAuth from "express-basic-auth";

import { EventBodySchema, EventName, QueueJobs } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  convertTraceUpsertEventsToRedisEvents,
  getTraceUpsertQueue,
  ingestionApiSchemaWithProjectId,
  redis,
} from "@langfuse/shared/src/server";
import * as Sentry from "@sentry/node";

import { env } from "../env";
import { checkContainerHealth } from "../features/health";
import logger from "../logger";
import { batchExportQueue } from "../queues/batchExportQueue";
import { ingestionFlushQueue } from "../queues/ingestionFlushQueue";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { IngestionService } from "../services/IngestionService";

const router = express.Router();

type EventsResponse = {
  status: "success" | "error";
};

router.get<{}, { status: string }>("/health", async (_req, res) => {
  try {
    await checkContainerHealth(res);
  } catch (e) {
    logger.error(e, "Health check failed");
    res.status(500).json({
      status: "error",
    });
  }
});

router
  .use(basicAuth({ users: { admin: env.LANGFUSE_WORKER_PASSWORD } }))
  .get<
    {},
    { status: "success" | "error"; message?: string }
  >("/clickhouse", async (req, res) => {
    try {
      // check if clickhouse is healthy
      try {
        const response = await clickhouseClient.query({
          query: "SELECT 1",
          format: "CSV",
        });

        logger.info(
          `Clickhouse health check response: ${JSON.stringify(await response.text())}`
        );

        res.json({ status: "success" });
      } catch (e) {
        logger.error(e, "Clickhouse health check failed");
        res.status(500).json({ status: "error", message: JSON.stringify(e) });
      }
    } catch (e) {
      logger.error(e, "Unexpected error during Clickhouse health check");
      res.status(500).json({ status: "error", message: JSON.stringify(e) });
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
        const jobs = convertTraceUpsertEventsToRedisEvents(event.data.payload);
        const traceUpsertQueue = getTraceUpsertQueue();

        await traceUpsertQueue?.addBulk(jobs); // add all jobs as bulk

        if (traceUpsertQueue) {
          logger.info(
            `Added ${jobs.length} trace upsert jobs to the queue`,
            jobs
          );
        }

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

      return res.status(400).send();
    } catch (e) {
      logger.error(e, "Error processing events");
      Sentry.captureException(e);
      return res.status(500).json({
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
  .post("/ingestion", async (req, res) => {
    try {
      if (!redis) {
        throw new Error("Redis connection not available");
      }

      const { body } = req;
      const events = ingestionApiSchemaWithProjectId.safeParse(body);

      if (!events.success) {
        logger.error(events.error, "Failed to parse ingestion event");

        return res.status(400).json(events.error);
      }

      const { batch, projectId } = events.data;

      if (!ingestionFlushQueue) {
        throw Error("Ingestion flush queue not available");
      }

      await new IngestionService(
        redis,
        prisma,
        ingestionFlushQueue,
        ClickhouseWriter.getInstance(),
        clickhouseClient,
        env.LANGFUSE_INGESTION_BUFFER_TTL_SECONDS // TODO: Make this configurable,
      ).addBatch(batch, projectId);

      return res.status(200).send();
    } catch (e) {
      logger.error(e, "Failed to process ingestion event");

      if (!res.headersSent)
        return res
          .status(500)
          .json({ message: e instanceof Error ? e.message : undefined });
    }
  });

export default router;
