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
  compareVersions,
  ResourceSpan,
} from "@langfuse/shared/src/server";
import {
  applyIngestionMasking,
  isIngestionMaskingEnabled,
} from "@langfuse/shared/src/server/ee/ingestionMasking";
import { env } from "../env";
import { IngestionService } from "../services/IngestionService";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import {
  ForbiddenError,
  convertEventRecordToObservationForEval,
} from "@langfuse/shared";
import {
  fetchObservationEvalConfigs,
  scheduleObservationEvals,
  createObservationEvalSchedulerDeps,
} from "../features/evaluation/observationEval";

/**
 * SDK information extracted from OTEL resourceSpans.
 */
type SdkInfo = {
  scopeName: string | null;
  scopeVersion: string | null;
  telemetrySdkLanguage: string | null;
};

/**
 * Extract SDK information from resourceSpans.
 * Gets scope name/version and telemetry SDK language from the OTEL structure.
 */
function getSdkInfoFromResourceSpans(resourceSpans: ResourceSpan): SdkInfo {
  try {
    // Get the first scopeSpan (all spans in a batch share the same scope)
    const firstScopeSpan = resourceSpans?.scopeSpans?.[0];
    const scopeName = firstScopeSpan?.scope?.name ?? null;
    const scopeVersion = firstScopeSpan?.scope?.version ?? null;

    // Extract telemetry SDK language from resource attributes
    const resourceAttributes = resourceSpans?.resource?.attributes ?? [];
    const telemetrySdkLanguage =
      resourceAttributes.find((attr) => attr.key === "telemetry.sdk.language")
        ?.value?.stringValue ?? null;

    return { scopeName, scopeVersion, telemetrySdkLanguage };
  } catch (error) {
    logger.warn("Failed to extract SDK info from resourceSpans", error);
    return { scopeName: null, scopeVersion: null, telemetrySdkLanguage: null };
  }
}

/**
 * Check if SDK meets version requirements for direct event writes.
 *
 * Requirements:
 * - Scope name must contain 'langfuse' (case-insensitive)
 * - Python SDK: scope_version >= 3.9.0
 * - JS/JavaScript SDK: scope_version >= 4.4.0
 */
function checkSdkVersionRequirements(
  sdkInfo: SdkInfo,
  isSdkExperimentBatch: boolean,
): boolean {
  const { scopeName, scopeVersion, telemetrySdkLanguage } = sdkInfo;

  // Must be a Langfuse SDK
  if (!scopeName || !String(scopeName).toLowerCase().includes("langfuse")) {
    return false;
  }

  if (!scopeVersion || !telemetrySdkLanguage) {
    return false;
  }

  try {
    // Python SDK >= 3.9.0
    if (telemetrySdkLanguage === "python" && isSdkExperimentBatch) {
      const comparison = compareVersions(scopeVersion, "v3.9.0");
      return comparison === null; // null means current >= latest
    }

    // JS/JavaScript SDK >= 4.4.0
    if (
      (telemetrySdkLanguage === "js" ||
        telemetrySdkLanguage === "javascript") &&
      isSdkExperimentBatch
    ) {
      const comparison = compareVersions(scopeVersion, "v4.4.0");
      return comparison === null; // null means current >= latest
    }

    return false;
  } catch (error) {
    logger.warn(
      `Failed to parse SDK version ${scopeVersion} for language ${telemetrySdkLanguage}`,
      error,
    );
    return false;
  }
}

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

    // Parse spans from S3 download
    let parsedSpans = JSON.parse(resourceSpans);

    // Apply ingestion masking if enabled (EE feature)
    if (isIngestionMaskingEnabled()) {
      const maskingResult = await applyIngestionMasking({
        data: parsedSpans,
        projectId,
        orgId: job.data.payload.authCheck.scope.orgId,
        propagatedHeaders: job.data.payload.propagatedHeaders,
      });

      if (!maskingResult.success) {
        // Fail-closed: drop event
        logger.warn(`Dropping OTEL event due to masking failure`, {
          projectId,
          error: maskingResult.error,
        });
        return;
      }
      parsedSpans = maskingResult.data;
    }

    // Generate events via OtelIngestionProcessor
    const processor = new OtelIngestionProcessor({
      projectId,
      publicKey,
    });
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
          logger.warn(
            `Failed to parse otel observation for project ${projectId} in ${fileKey}: ${o.error}`,
            o.error,
          );
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

    // Decide whether observations should be processed via new flow (directly to events table)
    // or via the dual write (staging table and batch job to events).
    // Rules:
    // 1. If the environment is `sdk-experiment`, JS SDK 4.4.0+ and python SDK 3.9.0+ will write directly to events.
    // 2. All other observations will go through the dual write until we have SDKs in place that have old trace updates
    //    deprecated and new methods in place.
    // 3. Non-Langfuse SDK spans will go through the dual write until a yet to be determined cutoff date.
    // Check if any observation has environment='sdk-experiment'
    const hasExperimentEnvironment = observations.some((o) => {
      const body = o.body as { environment?: string };
      return body.environment === "sdk-experiment";
    });
    const sdkInfo =
      parsedSpans.length > 0
        ? getSdkInfoFromResourceSpans(parsedSpans[0])
        : { scopeName: null, scopeVersion: null, telemetrySdkLanguage: null };
    const useDirectEventWrite = checkSdkVersionRequirements(
      sdkInfo,
      hasExperimentEnvironment,
    );

    const shouldForwardToEventsTable =
      !useDirectEventWrite &&
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true" &&
      env.QUEUE_CONSUMER_EVENT_PROPAGATION_QUEUE_IS_ENABLED === "true" &&
      env.LANGFUSE_EXPERIMENT_EARLY_EXIT_EVENT_BATCH_JOB !== "true";

    // Running everything concurrently might be detrimental to the event loop, but has probably
    // the highest possible throughput. Therefore, we start with a Promise.all.
    // If necessary, we may use a for each instead.

    // Process observations via mergeAndWrite
    const observationWritePromise = Promise.all(
      observations.map((observation) =>
        ingestionService.mergeAndWrite(
          getClickhouseEntityType(observation.type),
          auth.scope.projectId,
          observation.body.id || "", // id is always defined for observations
          new Date(), // Use the current timestamp as event time
          [observation],
          shouldForwardToEventsTable,
        ),
      ),
    );

    // Process traces and observations concurrently
    await Promise.all([
      observationWritePromise,
      processEventBatch(traces, auth, {
        delay: 0,
        source: "otel",
        forwardToEventsTable: shouldForwardToEventsTable,
      }),
    ]);

    // Process events for observation evals and direct event writes
    // This phase handles two independent concerns:
    // 1. Scheduling observation-level evals (if eval configs exist)
    // 2. Writing directly to events table (if SDK version requirements are met)
    //
    // Both require enriched event records with trace-level attributes
    // (userId, sessionId, tags, release) that processToEvent provides.
    const eventInputs = processor.processToEvent(parsedSpans);

    if (eventInputs.length === 0) {
      return;
    }

    // Determine what processing is needed
    const shouldWriteToEventsTable =
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true" &&
      useDirectEventWrite;

    const evalConfigs = await fetchObservationEvalConfigs(projectId).catch(
      (error) => {
        traceException(error);
        logger.warn(
          `Failed to fetch observation eval configs for project ${projectId}`,
          error,
        );

        return [];
      },
    );
    const hasEvalConfigs = evalConfigs.length > 0;

    // Early exit if no processing needed
    if (!hasEvalConfigs && !shouldWriteToEventsTable) {
      return;
    }

    // Create scheduler deps only if we have eval configs
    const evalSchedulerDeps = hasEvalConfigs
      ? createObservationEvalSchedulerDeps()
      : null;

    await Promise.all(
      // Process each event independently
      eventInputs.map(async (eventInput) => {
        // Step 1: Create enriched event record (required for both evals and writes)
        let eventRecord;
        try {
          eventRecord = await ingestionService.createEventRecord(
            eventInput,
            fileKey,
          );
        } catch (error) {
          traceException(error);
          logger.error(
            `Failed to create event record for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
            error,
          );

          return;
        }

        // Step 2: Schedule observation evals (independent of event writes)
        if (hasEvalConfigs && evalSchedulerDeps) {
          try {
            const observation =
              convertEventRecordToObservationForEval(eventRecord);

            await scheduleObservationEvals({
              observation,
              configs: evalConfigs,
              schedulerDeps: evalSchedulerDeps,
            });
          } catch (error) {
            traceException(error);

            logger.error(
              `Failed to schedule observation evals for project ${eventInput.projectId} and observation ${eventInput.spanId}`,
              error,
            );
          }
        }

        // Step 3: Write to events table (independent of eval scheduling)
        if (shouldWriteToEventsTable) {
          try {
            ingestionService.writeEventRecord(eventRecord);
          } catch (error) {
            traceException(error);
            logger.error(
              `Failed to write event record for ${eventInput.spanId}`,
              error,
            );
          }
        }
      }),
    );
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
