import type { StorageService } from "../services/StorageService";

// Types a browser can open from the storage origin without running script.
// Everything else, e.g. HTML, SVG, XML or JavaScript, is served as a download.
const SAFE_INLINE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "image/avif",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);
const SAFE_INLINE_MEDIA_TYPE_PREFIXES = ["audio/", "video/"];

/**
 * Signs a download URL for a Langfuse-managed media object. The response
 * Content-Type is pinned to the type recorded for the media, so the type the
 * object was stored with never decides how a browser renders it.
 *
 * Returns `null` for media outside the safe-inline allowlist when the provider
 * cannot pin response headers: any link would let its holder render the
 * object inline on the storage origin.
 */
export async function getMediaDownloadUrl(params: {
  storageService: StorageService;
  bucketPath: string;
  contentType: string;
  ttlSeconds: number;
}) {
  const { storageService, bucketPath, contentType, ttlSeconds } = params;
  const isSafeInline = isSafeInlineMediaType(contentType);
  if (!isSafeInline && !storageService.canOverrideResponseHeaders) {
    return null;
  }
  return storageService.getSignedUrl(
    bucketPath,
    ttlSeconds,
    !isSafeInline,
    contentType,
  );
}

function isSafeInlineMediaType(contentType: string) {
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  return (
    SAFE_INLINE_MEDIA_TYPES.has(mimeType) ||
    SAFE_INLINE_MEDIA_TYPE_PREFIXES.some((prefix) =>
      mimeType.startsWith(prefix),
    )
  );
}
