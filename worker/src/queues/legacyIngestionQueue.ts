import { Job, Processor } from "bullmq";
import {
  traceException,
  LegacyIngestionQueue,
  instrumentAsync,
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
import { SpanKind } from "@opentelemetry/api";

export const legacyIngestionQueueProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>
) => {
  return instrumentAsync(
    {
      name: "legacyIngestion",
      spanKind: SpanKind.CONSUMER,
      rootSpan: true,
      traceContext: job.data?._tracecontext,
    },
    async () => {
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

        // Log wait time
        const waitTime = Date.now() - job.timestamp;
        logger.debug(
          `Received flush request after ${waitTime} ms for ${job.data.payload.authCheck.scope.projectId}`
        );

        recordIncrement("legacy_ingestion_processing_request");
        recordHistogram("legacy_ingestion_flush_wait_time", waitTime, {
          unit: "milliseconds",
        });

        const result = await handleBatch(
          job.data.payload.data,
          job.data.payload.authCheck,
          tokenCount
        );

        // send out REDIS requests to worker for all trace types
        await sendToWorkerIfEnvironmentConfigured(
          result.results,
          job.data.payload.authCheck.scope.projectId
        );

        // Log queue size
        await LegacyIngestionQueue.getInstance()
          ?.count()
          .then((count) => {
            logger.debug(`Legacy Ingestion flush queue length: ${count}`);
            recordGauge("legacy_ingestion_flush_queue_length", count, {
              unit: "records",
            });
            return count;
          })
          .catch();
        recordHistogram(
          "legacy_ingestion_processing_time",
          Date.now() - startTime,
          { unit: "milliseconds" }
        );
      } catch (e) {
        logger.error(
          `Failed job Evaluation for traceId ${job.data.payload}`,
          e
        );
        traceException(e);
        throw e;
      }
    }
  );
};
