import { env } from "@/src/env.mjs";

/**
 * Returns the HTTP headers a client must send on the direct-to-storage PUT for a
 * media upload, keyed by the configured media storage provider.
 *
 * Azure Blob Storage rejects a Put Blob request that omits `x-ms-blob-type`
 * (`MissingRequiredHeader`), regardless of the SAS token. S3/MinIO, GCS and OCI
 * accept the existing `Content-Type` + checksum headers the client already
 * sends, so they need nothing extra here.
 *
 * The provider decision mirrors `getMediaStorageServiceClient`, which lets
 * `StorageServiceFactory` fall back to `LANGFUSE_USE_AZURE_BLOB` for the media
 * bucket. Keep these two in sync.
 */
export function getRequiredUploadHeaders(): Record<string, string> {
  if (env.LANGFUSE_USE_AZURE_BLOB === "true") {
    return { "x-ms-blob-type": "BlockBlob" };
  }
  return {};
}
