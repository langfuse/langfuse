// Cost bucket of a blob export's S3 data transfer. Same-region S3 transfer is
// free; cross-region and internet egress are paid. Tagged on the byte metrics
// so export volume can be broken down by cost in the Datadog dashboard.
export const BlobExportTraffic = {
  SAME_REGION: "SAME_REGION",
  CROSS_REGION: "CROSS_REGION",
  EXTERNAL: "EXTERNAL",
  // Real S3 but the region comparison is undecidable — the worker region is
  // not configured (e.g. non-AWS deployment) or the destination region is
  // unset/"auto". Kept distinct so it doesn't pollute the paid CROSS_REGION
  // bucket.
  UNKNOWN: "UNKNOWN",
} as const;
export type BlobExportTraffic =
  (typeof BlobExportTraffic)[keyof typeof BlobExportTraffic];

/**
 * Classify export traffic by data-transfer cost bucket:
 * - EXTERNAL: a custom endpoint (R2, MinIO, GCS, …) — internet egress.
 * - SAME_REGION: destination S3 region matches the worker region — free.
 * - CROSS_REGION: destination S3 region differs from the worker region — paid.
 * - UNKNOWN: real S3 but undecidable (worker region not configured, or the
 *   destination region is unset/"auto").
 */
export function classifyBlobExportTraffic(
  endpoint: string | null | undefined,
  destinationRegion: string | null | undefined,
  workerRegion: string | undefined,
): BlobExportTraffic {
  if (endpoint) return BlobExportTraffic.EXTERNAL;
  if (!workerRegion) return BlobExportTraffic.UNKNOWN;
  if (!destinationRegion || destinationRegion === "auto")
    return BlobExportTraffic.UNKNOWN;
  return destinationRegion.toLowerCase() === workerRegion.toLowerCase()
    ? BlobExportTraffic.SAME_REGION
    : BlobExportTraffic.CROSS_REGION;
}
