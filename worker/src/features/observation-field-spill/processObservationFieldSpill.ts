import {
  type EventRecordInsertType,
  type ObservationFieldsForSpill,
  type ObservationFieldSpillOutcome,
  logger,
  recordDistribution,
  recordIncrement,
  spillOversizedObservationFields,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import { MediaContentType } from "@langfuse/shared";

import { env } from "../../env";

export async function spillOversizedEventRecordFields(
  eventRecord: EventRecordInsertType,
): Promise<EventRecordInsertType> {
  const spillResult = await processObservationFieldSpill({
    projectId: eventRecord.project_id,
    traceId: eventRecord.trace_id,
    observationId: eventRecord.span_id,
    fields: {
      input: eventRecord.input,
      output: eventRecord.output,
      metadata: eventRecord.metadata_values,
    },
  });
  const persistedMetadataValues = Array.isArray(spillResult.fields.metadata)
    ? spillResult.fields.metadata
    : [];

  return {
    ...eventRecord,
    input: spillResult.fields.input ?? undefined,
    output: spillResult.fields.output ?? undefined,
    metadata_values: persistedMetadataValues.map((value) =>
      typeof value === "string"
        ? value
        : (JSON.stringify(value) ?? String(value)),
    ),
  };
}

export async function processObservationFieldSpill(params: {
  projectId: string;
  traceId: string;
  observationId: string;
  fields: ObservationFieldsForSpill;
}): Promise<{
  fields: ObservationFieldsForSpill;
  outcomes: ObservationFieldSpillOutcome[];
}> {
  const { projectId, traceId, observationId, fields } = params;

  const result = await spillOversizedObservationFields({
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
    recordIncrement("langfuse.ingestion.observation_field_spill", 1, {
      field: outcome.field,
      outcome: outcome.outcome,
    });
    recordDistribution(
      "langfuse.ingestion.observation_field_spill.original_bytes",
      outcome.originalBytes,
      { field: outcome.field, outcome: outcome.outcome },
    );
    recordDistribution(
      "langfuse.ingestion.observation_field_spill.persisted_bytes",
      outcome.persistedBytes,
      { field: outcome.field, outcome: outcome.outcome },
    );
  }

  return result;
}
