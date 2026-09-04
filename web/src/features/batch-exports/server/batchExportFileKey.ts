/**
 * Extracts the storage object key from a stored presigned download URL.
 *
 * Completed batch exports persist a presigned URL (`batch_exports.url`), not
 * the object key. Presigned URLs die with the signing credentials — on AWS a
 * URL signed with role-session credentials expires with the session (hours),
 * long before the 24h download window — so the exports page re-signs a fresh
 * URL on demand and needs the key back out of the stored URL.
 *
 * Handles virtual-hosted-style URLs (`https://bucket.s3.../key`) where the
 * path is the key, and path-style / GCS / Azure URLs (`https://host/bucket/key`)
 * where the bucket or container name is the first path segment.
 */
export function parseBatchExportFileKeyFromUrl(
  storedUrl: string,
  bucketName: string,
): string | null {
  try {
    const url = new URL(storedUrl);
    const path = decodeURIComponent(url.pathname).replace(/^\//, "");
    if (path.startsWith(`${bucketName}/`)) {
      return path.slice(bucketName.length + 1) || null;
    }
    return path || null;
  } catch {
    return null;
  }
}
