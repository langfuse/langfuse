import { Job, Processor } from "bullmq";
import {
  clickhouseClient,
  getClickhouseEntityType,
  // getCurrentSpan,
  getS3EventStorageClient,
  type IngestionEventType,
  logger,
  OtelIngestionProcessor,
  processEventBatch,
  QueueName,
  redis,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import { IngestionService } from "../services/IngestionService";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../services/ClickhouseWriter";

export const otelIngestionQueueProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.OtelIngestionQueue]>,
): Promise<void> => {
  try {
    const projectId = job.data.payload.authCheck.scope.projectId;
    const publicKey = job.data.payload.data.publicKey;
    const fileKey = job.data.payload.data.fileKey;
    const auth = job.data.payload.authCheck;

    // const span = getCurrentSpan();

    // Download file from blob storage
    const resourceSpans = await getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    ).download(fileKey);

    // Generate events via OtelIngestionProcessor
    const processor = new OtelIngestionProcessor({
      projectId,
      publicKey,
    });
    const events: IngestionEventType[] =
      await processor.processToIngestionEvents(JSON.parse(resourceSpans));
    // Here, we split the events into observations and non-observations.
    // Observations go into the IngestionService directly whereas the non-observations make another run through the processEventBatch method.
    const traces = events.filter(
      (e) => getClickhouseEntityType(e.type) !== "observation",
    );
    const observations = events.filter(
      (e) => getClickhouseEntityType(e.type) === "observation",
    );

    // Ensure required infra config is present
    if (!redis) throw new Error("Redis not available");
    if (!prisma) throw new Error("Prisma not available");

    const ingestionService = new IngestionService(
      redis,
      prisma,
      ClickhouseWriter.getInstance(),
      clickhouseClient(),
    );

    // Running everything concurrently might be detrimental to the event loop, but has probably
    // the highest possible throughput. Therefore, we start with a Promise.all.
    // If necessary, we may use a for each instead.
    await Promise.all(
      [
        // Process traces
        processEventBatch(traces, auth, { delay: 0, source: "otel" }),
        // Process observations
        observations.map((observation) =>
          ingestionService.mergeAndWrite(
            getClickhouseEntityType(observation.type),
            auth.scope.projectId,
            observation.body.id || "", // id is always defined for observations
            new Date(), // Use the current timestamp as event time
            [observation],
          ),
        ),
      ].flat(),
    );
  } catch (e) {
    logger.error(
      `Failed job otel ingestion processing for ${job.data.payload.authCheck.scope.projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
