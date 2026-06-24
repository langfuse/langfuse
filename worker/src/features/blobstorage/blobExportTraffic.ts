// Cost bucket of a blob export's S3 data transfer, tagged on the byte metrics
// so export volume can be broken down by cost in the Datadog dashboard.
//
// Today we only split on whether the destination is native AWS S3 vs. a custom
// endpoint, which needs no knowledge of the worker's own region. The finer
// SAME_REGION / CROSS_REGION breakdown within SAME_CLOUD (which would require
// exposing the worker region from deployment config) is intentionally deferred
// until there is demand for it.
export const BlobExportTraffic = {
  // Native AWS S3 (no custom endpoint): same cloud as the worker.
  SAME_CLOUD: "SAME_CLOUD",
  // A custom endpoint is set (R2, MinIO, GCS, Azure, …): internet egress.
  EXTERNAL: "EXTERNAL",
} as const;
export type BlobExportTraffic =
  (typeof BlobExportTraffic)[keyof typeof BlobExportTraffic];

export function classifyBlobExportTraffic(
  endpoint: string | null | undefined,
): BlobExportTraffic {
  return endpoint ? BlobExportTraffic.EXTERNAL : BlobExportTraffic.SAME_CLOUD;
}
