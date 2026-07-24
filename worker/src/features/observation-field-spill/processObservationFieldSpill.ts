import {
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

export type ProcessObservationFieldSpill = typeof processObservationFieldSpill;
