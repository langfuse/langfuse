import { env } from "@/src/env.mjs";
import {
  type DatasetItemMediaField,
  InternalServerError,
  InvalidRequestError,
  isMediaContentType,
  type MediaContentType,
} from "@langfuse/shared";
import {
  fetchWithSecureRedirects,
  parseOutboundUrl,
  uploadMediaForDatasetItem,
  validateOutboundUrlHost,
  type ValidateOutboundUrlHostOptions,
} from "@langfuse/shared/src/server";

const MAX_MEDIA_URL_LENGTH = 2048;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_INGEST_BYTES = 100 * 1024 * 1024;

const URL_VALIDATION_OPTIONS = {
  whitelist: { hosts: [], ips: [], ip_ranges: [] },
  logContext: "Dataset CSV media URL",
  shouldSkipDnsCheckForLiteralIps: true,
} satisfies Omit<ValidateOutboundUrlHostOptions, "url">;

// Matches the UI previewer's unambiguous media-URL extensions so CSV import
// converts the same strings the item table already renders as media chips.
const URL_EXTENSION_TO_MIME: Record<string, MediaContentType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  tiff: "image/tiff",
  tif: "image/tiff",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mpeg: "video/mpeg",
};

const PREVIEWABLE_TOP_LEVEL = new Set(["image", "audio", "video"]);

export type IngestDatasetItemMediaFromUrlResult = {
  referenceString: string;
  mediaId: string;
  contentType: MediaContentType;
  contentLength: number;
  sha256Hash: string;
};

function contentTypeFromMediaUrl(urlString: string): MediaContentType | null {
  let pathname: string;
  try {
    pathname = new URL(urlString).pathname;
  } catch {
    return null;
  }
  const ext = pathname.split(".").pop()?.toLowerCase();
  if (!ext || ext === pathname) return null;
  return URL_EXTENSION_TO_MIME[ext] ?? null;
}

function normalizeContentTypeHeader(
  header: string | null,
): MediaContentType | null {
  if (!header) return null;
  const mime = header.split(";")[0]?.trim().toLowerCase();
  if (!mime || !isMediaContentType(mime)) return null;
  if (!PREVIEWABLE_TOP_LEVEL.has(mime.split("/")[0]!)) return null;
  return mime;
}

async function assertSafeHttpsMediaUrl(urlString: string): Promise<void> {
  if (urlString.length > MAX_MEDIA_URL_LENGTH) {
    throw new InvalidRequestError("Media URL is too long");
  }

  const url = parseOutboundUrl(urlString);
  if (url.protocol !== "https:") {
    throw new InvalidRequestError(
      "Only https media URLs can be imported. Convert http URLs or attach the file in the item editor.",
    );
  }

  await validateOutboundUrlHost({
    url,
    ...URL_VALIDATION_OPTIONS,
  });
}

async function readResponseBytes(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INGEST_BYTES) {
    throw new InvalidRequestError(
      `Media file is larger than ${MAX_INGEST_BYTES} bytes`,
    );
  }

  const body = response.body;
  if (!body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_INGEST_BYTES) {
      throw new InvalidRequestError(
        `Media file is larger than ${MAX_INGEST_BYTES} bytes`,
      );
    }
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_INGEST_BYTES) {
      await reader.cancel();
      throw new InvalidRequestError(
        `Media file is larger than ${MAX_INGEST_BYTES} bytes`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches a third-party media URL (SSRF-checked) and stores it as project media,
 * returning a `@@@langfuseMedia:...@@@` reference for the dataset item JSON.
 */
export async function ingestDatasetItemMediaFromUrl(params: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  field: DatasetItemMediaField;
  url: string;
}): Promise<IngestDatasetItemMediaFromUrlResult> {
  const uploadBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
  if (!uploadBucket) {
    throw new InternalServerError(
      "Media upload to blob storage not enabled or no bucket configured",
    );
  }

  await assertSafeHttpsMediaUrl(params.url);

  const { response } = await fetchWithSecureRedirects(
    params.url,
    {
      method: "GET",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "image/*,audio/*,video/*" },
    },
    {
      maxRedirects: MAX_REDIRECTS,
      redirectValidation: {
        validateUrl: async (redirectUrl) => {
          await assertSafeHttpsMediaUrl(redirectUrl);
        },
        whitelist: URL_VALIDATION_OPTIONS.whitelist,
        logContext: URL_VALIDATION_OPTIONS.logContext,
      },
    },
  );

  if (!response.ok) {
    throw new InvalidRequestError(
      `Failed to fetch media URL (HTTP ${response.status})`,
    );
  }

  const contentType =
    normalizeContentTypeHeader(response.headers.get("content-type")) ??
    contentTypeFromMediaUrl(params.url);

  if (!contentType) {
    throw new InvalidRequestError(
      "URL is not a supported image, audio, or video file",
    );
  }

  const contentBytes = await readResponseBytes(response);
  if (contentBytes.byteLength === 0) {
    throw new InvalidRequestError("Media URL returned an empty file");
  }

  if (contentBytes.byteLength > env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH) {
    throw new InvalidRequestError(
      `File size must be less than ${env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH} bytes`,
    );
  }

  const stored = await uploadMediaForDatasetItem({
    projectId: params.projectId,
    datasetId: params.datasetId,
    datasetItemId: params.datasetItemId,
    field: params.field,
    contentType,
    contentBytes,
    mediaBucket: uploadBucket,
    mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX ?? "",
  });

  return {
    referenceString: `@@@langfuseMedia:type=${contentType}|id=${stored.mediaId}|source=bytes@@@`,
    mediaId: stored.mediaId,
    contentType,
    contentLength: contentBytes.byteLength,
    sha256Hash: stored.sha256Hash,
  };
}
