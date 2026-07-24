import {
  OBSERVATION_FIELD_SIZE_LIMIT_BYTES,
  OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE,
} from "../../domain/observation-field-spill";
import type { MediaField } from "../../domain/media";
import type { UploadMediaForTraceResult } from "./mediaService";

export type ObservationFieldsForSpill = {
  input?: string | null;
  output?: string | null;
  metadata?: Record<string, unknown> | unknown[] | null;
};

export type ObservationFieldSpillOutcome = {
  field: MediaField;
  outcome: UploadMediaForTraceResult["outcome"] | "failed";
  originalBytes: number;
  persistedBytes: number;
};

type UploadOversizedObservationField = (params: {
  field: MediaField;
  contentBytes: Buffer;
}) => Promise<UploadMediaForTraceResult>;

/**
 * Replaces observation input/output values and individual metadata values that
 * exceed the persisted-field byte limit with downloadable media references.
 *
 * Upload failures fail open per value: the original value is preserved and
 * processing continues with the remaining fields.
 */
export async function spillOversizedObservationFields(params: {
  fields: ObservationFieldsForSpill;
  upload: UploadOversizedObservationField;
  maxFieldBytes?: number;
  onUploadError?: (params: {
    error: unknown;
    field: MediaField;
    originalBytes: number;
  }) => void;
}): Promise<{
  fields: ObservationFieldsForSpill;
  outcomes: ObservationFieldSpillOutcome[];
}> {
  const {
    fields,
    upload,
    maxFieldBytes = OBSERVATION_FIELD_SIZE_LIMIT_BYTES,
    onUploadError,
  } = params;
  const transformedFields: ObservationFieldsForSpill = { ...fields };
  const outcomes: ObservationFieldSpillOutcome[] = [];

  for (const field of ["input", "output"] as const) {
    const value = fields[field];
    if (value == null) continue;

    const transformed = await spillValue({
      field,
      serializedValue: value,
      fallbackValue: value,
      maxFieldBytes,
      upload,
      onUploadError,
    });
    transformedFields[field] = transformed.value as string;
    if (transformed.outcome) outcomes.push(transformed.outcome);
  }

  if (Array.isArray(fields.metadata)) {
    const transformedMetadata = [...fields.metadata];
    for (const [index, value] of fields.metadata.entries()) {
      const transformed = await spillValue({
        field: "metadata",
        serializedValue: serializeFieldValue(value),
        fallbackValue: value,
        maxFieldBytes,
        upload,
        onUploadError,
      });
      transformedMetadata[index] = transformed.value;
      if (transformed.outcome) outcomes.push(transformed.outcome);
    }
    transformedFields.metadata = transformedMetadata;
  } else if (fields.metadata) {
    const transformedMetadata: Record<string, unknown> = {
      ...fields.metadata,
    };
    for (const [key, value] of Object.entries(fields.metadata)) {
      const serializedValue = serializeFieldValue(value);
      const transformed = await spillValue({
        field: "metadata",
        serializedValue,
        fallbackValue: value,
        maxFieldBytes,
        upload,
        onUploadError,
      });
      transformedMetadata[key] = transformed.value;
      if (transformed.outcome) outcomes.push(transformed.outcome);
    }
    transformedFields.metadata = transformedMetadata;
  }

  return { fields: transformedFields, outcomes };
}

function serializeFieldValue(value: unknown): string {
  if (typeof value === "string") return value;

  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

async function spillValue(params: {
  field: MediaField;
  serializedValue: string;
  fallbackValue: unknown;
  maxFieldBytes: number;
  upload: UploadOversizedObservationField;
  onUploadError:
    | ((params: {
        error: unknown;
        field: MediaField;
        originalBytes: number;
      }) => void)
    | undefined;
}): Promise<{
  value: unknown;
  outcome?: ObservationFieldSpillOutcome;
}> {
  const {
    field,
    serializedValue,
    fallbackValue,
    maxFieldBytes,
    upload,
    onUploadError,
  } = params;
  const contentBytes = Buffer.from(serializedValue, "utf8");
  const originalBytes = contentBytes.length;

  if (originalBytes <= maxFieldBytes) {
    return { value: fallbackValue };
  }

  try {
    const uploadResult = await upload({ field, contentBytes });
    const mediaReference =
      `@@@langfuseMedia:type=text/plain|id=${uploadResult.mediaId}` +
      `|source=${OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE}@@@`;

    return {
      value: mediaReference,
      outcome: {
        field,
        outcome: uploadResult.outcome,
        originalBytes,
        persistedBytes: Buffer.byteLength(mediaReference, "utf8"),
      },
    };
  } catch (error) {
    onUploadError?.({ error, field, originalBytes });
    return {
      value: fallbackValue,
      outcome: {
        field,
        outcome: "failed",
        originalBytes,
        persistedBytes: originalBytes,
      },
    };
  }
}
