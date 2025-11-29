/**
 * Generates hour-level S3 prefixes for OTEL events within a time range.
 *
 * OTEL S3 path structure:
 * {prefix}otel/{projectId}/{yyyy}/{mm}/{dd}/{hh}/{mm}/{uuid}.json
 *
 * This function generates prefixes at the hour level for efficiency:
 * {prefix}otel/{projectId}/{yyyy}/{mm}/{dd}/{hh}/
 */
export function generateOtelS3Prefixes(
  s3Prefix: string,
  projectId: string,
  startDate: Date,
  endDate: Date,
): string[] {
  const prefixes: string[] = [];
  const current = new Date(startDate);

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

  return prefixes;
}
