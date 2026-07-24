export const OBSERVATION_FIELD_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

export const OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE = "field_size_limit";

export function isObservationFieldSizeLimitMediaReference(
  value: unknown,
): value is string {
  const prefix = "@@@langfuseMedia:";
  const suffix = "@@@";
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    !value.endsWith(suffix)
  ) {
    return false;
  }

  return value
    .slice(prefix.length, -suffix.length)
    .split("|")
    .includes(`source=${OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE}`);
}
