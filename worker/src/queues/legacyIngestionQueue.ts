import { Job, Processor } from "bullmq";
import {
  traceException,
  LegacyIngestionQueue,
  QueueName,
  recordIncrement,
  recordGauge,
  recordHistogram,
  TQueueJobTypes,
  logger,
} from "@langfuse/shared/src/server";

import {
  handleBatch,
  sendToWorkerIfEnvironmentConfigured,
} from "@langfuse/shared/src/server";
import { tokenCount } from "../features/tokenisation/usage";

export const legacyIngestionQueueProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>,
) => {
  try {
    const startTime = Date.now();
    logger.info("Processing legacy ingestion", {
      payload: job.data.payload.data.map(({ body, ...rest }) => {
        let modifiedBody = body;
        if (body && "input" in modifiedBody) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { input, ...restPayload } = modifiedBody || {};
          modifiedBody = restPayload;
        }
        if (body && "output" in modifiedBody) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { output, ...restPayload } = modifiedBody || {};
          modifiedBody = restPayload;
        }
        return {
          ...rest,
          body: modifiedBody,
        };
      }),
    });

    const waitTime = Date.now() - job.timestamp;
    recordIncrement("langfuse.queue.legacy_ingestion.request");
    recordHistogram("langfuse.queue.legacy_ingestion.wait_time", waitTime, {
      unit: "milliseconds",
    });

    const result = await handleBatch(
      job.data.payload.data,
      job.data.payload.authCheck,
      tokenCount,
    );

    // send out REDIS requests to worker for all trace types
    await sendToWorkerIfEnvironmentConfigured(
      result.results,
      job.data.payload.authCheck.scope.projectId,
    );

    // Log queue size
    await LegacyIngestionQueue.getInstance()
      ?.count()
      .then((count) => {
        logger.debug(`Legacy Ingestion flush queue length: ${count}`);
        recordGauge("langfuse.queue.legacy_ingestion.length", count, {
          unit: "records",
        });
        return count;
      })
      .catch();
    recordHistogram(
      "langfuse.queue.legacy_ingestion.processing_time",
      Date.now() - startTime,
      { unit: "milliseconds" },
    );
  } catch (e) {
    logger.error(
      `Failed job legacy ingestion processing for ${job.data.payload.authCheck.scope.projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
