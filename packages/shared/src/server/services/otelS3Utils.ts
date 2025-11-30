export type OtelS3Granularity = "hour" | "minute";

/**
 * Generates S3 prefixes for OTEL events within a time range.
 *
 * OTEL S3 path structure:
 * {prefix}otel/{projectId}/{yyyy}/{mm}/{dd}/{hh}/{mm}/{uuid}.json
 *
 * This function generates prefixes at the specified granularity level:
 * - hour (default): {prefix}otel/{projectId}/{yyyy}/{mm}/{dd}/{hh}/
 * - minute: {prefix}otel/{projectId}/{yyyy}/{mm}/{dd}/{hh}/{mm}/
 *
 * Use hour-level granularity for larger time ranges (fewer prefixes).
 * Use minute-level granularity for more precise control over which files to replay.
 */
export function generateOtelS3Prefixes(
  s3Prefix: string,
  projectId: string,
  startDate: Date,
  endDate: Date,
  granularity: OtelS3Granularity = "hour",
): string[] {
  const prefixes: string[] = [];
  const current = new Date(startDate);

  if (granularity === "hour") {
    // Truncate to hour
    current.setMinutes(0, 0, 0);

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      const hour = String(current.getHours()).padStart(2, "0");

      prefixes.push(
        `${s3Prefix}otel/${projectId}/${year}/${month}/${day}/${hour}/`,
      );

      // Advance by 1 hour
      current.setHours(current.getHours() + 1);
    }
  } else {
    // minute granularity
    // Truncate to minute
    current.setSeconds(0, 0);

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      const hour = String(current.getHours()).padStart(2, "0");
      const minute = String(current.getMinutes()).padStart(2, "0");

      prefixes.push(
        `${s3Prefix}otel/${projectId}/${year}/${month}/${day}/${hour}/${minute}/`,
      );

      // Advance by 1 minute
      current.setMinutes(current.getMinutes() + 1);
    }
  }

  return prefixes;
}
