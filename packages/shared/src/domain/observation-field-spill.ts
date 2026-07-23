export const OBSERVATION_FIELD_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

export const OBSERVATION_FIELD_SIZE_LIMIT_EXCEEDED_KEY =
  "_langfuse_field_size_limit_exceeded_file";

export const OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE = "field_size_limit";

export function createObservationFieldSizeLimitSentinel(
  mediaReference: string,
): string {
  return JSON.stringify({
    [OBSERVATION_FIELD_SIZE_LIMIT_EXCEEDED_KEY]: mediaReference,
  });
}
