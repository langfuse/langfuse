import { Job, Processor } from "bullmq";
import {
  clickhouseClient,
  createIngestionEventSchema,
  getClickhouseEntityType,
  getCurrentSpan,
  getS3EventStorageClient,
  type IngestionEventType,
  logger,
  OtelIngestionProcessor,
  processEventBatch,
  QueueName,
  recordDistribution,
  recordHistogram,
  recordIncrement,
  redis,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import { IngestionService } from "../services/IngestionService";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { ForbiddenError } from "@langfuse/shared";

export const otelIngestionQueueProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.OtelIngestionQueue]>,
): Promise<void> => {
  try {
    const projectId = job.data.payload.authCheck.scope.projectId;
    const publicKey = job.data.payload.data.publicKey;
    const fileKey = job.data.payload.data.fileKey;
    const auth = job.data.payload.authCheck;

    const span = getCurrentSpan();
    if (span) {
      span.setAttribute("messaging.bullmq.job.input.id", job.data.id);
      span.setAttribute(
        "messaging.bullmq.job.input.projectId",
        job.data.payload.authCheck.scope.projectId,
      );
      span.setAttribute(
        "messaging.bullmq.job.input.fileKey",
        job.data.payload.data.fileKey,
      );
    }
    logger.debug(`Processing ${fileKey} for project ${projectId}`);

    // TODO: Do we need to add these files into the blob_storage_file_log?
    // We could recommend lifecycle rules due to the immutability properties.
    // Otherwise, we'd probably have to upsert one row per generated event further below.
    // Easy change, but needs alignment.

    // Download file from blob storage
    const resourceSpans = await getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    ).download(fileKey);

    recordHistogram(
      "langfuse.ingestion.s3_file_size_bytes",
      resourceSpans.length, // At this point it's still a string.
      {
        skippedS3List: "true",
        otel: "true",
      },
    );

    // Generate events via OtelIngestionProcessor
    const processor = new OtelIngestionProcessor({
      projectId,
      publicKey,
    });
    const parsedSpans = JSON.parse(resourceSpans);
    const events: IngestionEventType[] =
      await processor.processToIngestionEvents(parsedSpans);
    // Here, we split the events into observations and non-observations.
    // Observations go into the IngestionService directly whereas the non-observations make another run through the processEventBatch method.
    const traces = events.filter(
      (e) => getClickhouseEntityType(e.type) !== "observation",
    );
    // We need to parse each incoming observation through our ingestion schema to make use of its included transformations.
    const ingestionSchema = createIngestionEventSchema();
    const observations = events
      .filter((e) => getClickhouseEntityType(e.type) === "observation")
      .map((o) => ingestionSchema.safeParse(o))
      .flatMap((o) => {
        if (!o.success) {
          logger.warn(`Failed to parse otel observation: ${o.error}`, o.error);
          return [];
        }
        return [o.data];
      });

    // In the next row, we only consider observations. The traces will be recorded in processEventBatch.
    recordIncrement("langfuse.ingestion.event", observations.length, {
      source: "otel",
    });
    // Record more stats specific to the Otel processing
    recordDistribution("langfuse.ingestion.otel.trace_count", traces.length);
    recordDistribution(
      "langfuse.ingestion.otel.observation_count",
      observations.length,
    );
    span?.setAttribute("langfuse.ingestion.otel.trace_count", traces.length);
    span?.setAttribute(
      "langfuse.ingestion.otel.observation_count",
      observations.length,
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
            // TODO: Eventually we want to set this one to true, but then skip the event processing below and vice versa
            false,
          ),
        ),
      ].flat(),
    );

    // If inserts into the events table are enabled, we run the dedicated processing for the otel
    // spans and move them into the dedicated IngestionService processor.
    if (env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true") {
      try {
        const events = processor.processToEvent(parsedSpans);
        await Promise.all(
          events.map((e) => ingestionService.writeEvent(e, fileKey)),
        );
      } catch (e) {
        traceException(e); // Mark span as errored
        logger.warn(`Failed to process events for ${projectId}: ${e}`, e);
        // Fallthrough while setting is experimental
      }
    }
  } catch (e) {
    if (e instanceof ForbiddenError) {
      traceException(e);
      logger.warn(`Failed to parse otel observation: ${e.message}`, e);
      return;
    }

    logger.error(
      `Failed job otel ingestion processing for ${job.data.payload.authCheck.scope.projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
