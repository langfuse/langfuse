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
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);
const SAFE_INLINE_MEDIA_TYPE_PREFIXES = ["audio/", "video/"];

// A single `type/subtype` of HTTP tokens with optional parameters. Browsers
// sniff the body of a type they cannot parse and use the last entry of a
// comma-separated list, so anything else cannot be trusted.
const HTTP_TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const STRICT_MEDIA_TYPE = new RegExp(
  `^(${HTTP_TOKEN}/${HTTP_TOKEN})(?:[ \\t]*;[^,]*)?$`,
);

/**
 * Signs a download URL for a Langfuse-managed media object. The response
 * Content-Type is pinned to the type recorded for the media, so the type the
 * object was stored with never decides how a browser renders it.
 *
 * Returns `null` when the provider cannot pin response headers and either the
 * recorded type is outside the safe-inline allowlist or the stored type is not
 * exactly the recorded type: any link would let its holder render the object
 * inline on the storage origin. The stored type is checked because such
 * providers do not bind it at upload; a missing object also gets no link.
 */
export async function getMediaDownloadUrl(params: {
  storageService: StorageService;
  bucketPath: string;
  contentType: string;
  ttlSeconds: number;
}) {
  const { storageService, bucketPath, contentType, ttlSeconds } = params;
  const isSafeInline = isSafeInlineMediaType(contentType);
  if (!storageService.canOverrideResponseHeaders) {
    if (!isSafeInline) return null;
    const storedContentType =
      await storageService.getObjectContentType(bucketPath);
    const storedEssence = storedContentType
      ? STRICT_MEDIA_TYPE.exec(storedContentType)?.[1].toLowerCase()
      : undefined;
    if (storedEssence !== mediaTypeEssence(contentType)) return null;
  }
  return storageService.getSignedUrl(
    bucketPath,
    ttlSeconds,
    !isSafeInline,
    contentType,
  );
}

function mediaTypeEssence(contentType: string) {
  return contentType.split(";")[0].trim().toLowerCase();
}

function isSafeInlineMediaType(contentType: string) {
  const mimeType = mediaTypeEssence(contentType);
  return (
    SAFE_INLINE_MEDIA_TYPES.has(mimeType) ||
    SAFE_INLINE_MEDIA_TYPE_PREFIXES.some((prefix) =>
      mimeType.startsWith(prefix),
    )
  );
}
