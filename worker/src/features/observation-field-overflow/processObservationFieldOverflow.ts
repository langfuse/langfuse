import {
  type EventRecordInsertType,
  type ObservationFieldsForOverflow,
  type ObservationFieldOverflowOutcome,
  logger,
  recordDistribution,
  recordIncrement,
  replaceOversizedObservationFieldsWithMedia,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import { MediaContentType } from "@langfuse/shared";

import { env } from "../../env";

export async function applyObservationFieldOverflow(
  eventRecord: EventRecordInsertType,
): Promise<EventRecordInsertType> {
  if (env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED !== "true") {
    return eventRecord;
  }

  const overflowResult = await processObservationFieldOverflow({
    projectId: eventRecord.project_id,
    traceId: eventRecord.trace_id,
    observationId: eventRecord.span_id,
    fields: {
      input: eventRecord.input,
      output: eventRecord.output,
      metadata: eventRecord.metadata_values,
    },
  });
  const persistedMetadataValues = Array.isArray(overflowResult.fields.metadata)
    ? overflowResult.fields.metadata
    : [];

  return {
    ...eventRecord,
    input: overflowResult.fields.input ?? undefined,
    output: overflowResult.fields.output ?? undefined,
    metadata_values: persistedMetadataValues.map((value) =>
      typeof value === "string"
        ? value
        : (JSON.stringify(value) ?? String(value)),
    ),
  };
}

export async function processObservationFieldOverflow(params: {
  projectId: string;
  traceId: string;
  observationId: string;
  fields: ObservationFieldsForOverflow;
}): Promise<{
  fields: ObservationFieldsForOverflow;
  outcomes: ObservationFieldOverflowOutcome[];
}> {
  const { projectId, traceId, observationId, fields } = params;

  const result = await replaceOversizedObservationFieldsWithMedia({
    fields,
    maxFieldBytes: env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES,
    upload: async ({ field, contentBytes }) => {
      if (!env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
        throw new Error("Media upload bucket is not configured");
      }

      return uploadMediaForTrace({
        projectId,
        traceId,
        observationId,
        field,
        contentType: MediaContentType.TXT,
        contentBytes,
        mediaBucket: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
        mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
      });
    },
    onUploadError: ({ error, field, originalBytes }) => {
      logger.warn(
        "Oversized observation field upload failed; persisting original field",
        {
          error,
          projectId,
          traceId,
          observationId,
          field,
          originalBytes,
        },
      );
    },
  });

  for (const outcome of result.outcomes) {
    recordIncrement("langfuse.ingestion.observation_field_overflow", 1, {
      field: outcome.field,
      outcome: outcome.outcome,
    });
    recordDistribution(
      "langfuse.ingestion.observation_field_overflow.bytes_removed",
      outcome.bytesRemoved,
      { field: outcome.field, outcome: outcome.outcome },
    );
  }

  return result;
}
