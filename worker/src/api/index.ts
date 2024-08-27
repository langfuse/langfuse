import express from "express";
import basicAuth from "express-basic-auth";
import {
  traceException,
  clickhouseClient,
  convertTraceUpsertEventsToRedisEvents,
  getTraceUpsertQueue,
  getBatchExportQueue,
  EventBodySchema,
  EventName,
  QueueJobs,
} from "@langfuse/shared/src/server";

import { env } from "../env";
import { checkContainerHealth } from "../features/health";
import logger from "../logger";

const router = express.Router();

type EventsResponse = {
  status: "success" | "error";
};

router.get<{}, { status: string }>("/health", async (_req, res) => {
  try {
    await checkContainerHealth(res);
  } catch (e) {
    traceException(e);
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
        await getBatchExportQueue()?.add(event.data.name, {
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
      traceException(e);
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
    return res.status(200).send(); // Not implemented, Send 200 to acknowledge the request for web containers to not throw
  });

export default router;
