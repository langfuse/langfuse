import { MediaReferenceStringSchema } from "@langfuse/shared";

/**
 * A JSON string leaf classified as previewable media. `contentType` is always
 * known here without any fetch, so the collapsed chip can render from it alone.
 * Langfuse refs resolve their URL lazily (via `useResolvedMedia`); data URIs
 * and plain URLs carry their own `src`.
 */
export type MediaLeafDescriptor =
  | {
      kind: "langfuseRef";
      contentType: string;
      mediaId: string;
      referenceString: string;
    }
  | { kind: "dataUri"; contentType: string; src: string }
  | { kind: "url"; contentType: string; src: string };

const LANGFUSE_MEDIA_PREFIX = "@@@langfuseMedia:";
const DATA_URI_PREFIX = "data:";
const MAX_LANGFUSE_REFERENCE_LENGTH = 512;

// Only surface a bare http(s) URL as media when its extension is unambiguous —
// otherwise every link in a payload would become a chip.
const URL_EXTENSION_TO_MIME: Record<string, string> = {
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

// data: URIs are only surfaced for genuinely-previewable top-level types.
const PREVIEWABLE_TOP_LEVEL = new Set(["image", "audio", "video"]);

// Guards the per-leaf hot path: bail before parsing a URL out of long strings.
const MAX_URL_LENGTH = 2048;

/**
 * Classifies a JSON string leaf as previewable media, or returns null. Pure and
 * cheap: a prefix check gates every branch so non-media strings (the common
 * case, possibly thousands per view) cost only a couple of `startsWith` calls.
 */
export function classifyMediaLeaf(value: unknown): MediaLeafDescriptor | null {
  if (typeof value !== "string" || value.length === 0) return null;

  if (value.startsWith(LANGFUSE_MEDIA_PREFIX)) {
    if (value.length > MAX_LANGFUSE_REFERENCE_LENGTH) return null;
    const parsed = MediaReferenceStringSchema.safeParse(value);
    if (!parsed.success) return null;
    return {
      kind: "langfuseRef",
      contentType: parsed.data.type,
      mediaId: parsed.data.id,
      referenceString: parsed.data.referenceString,
    };
  }

  if (value.startsWith(DATA_URI_PREFIX)) {
    // Read only the head — a base64 payload can be megabytes long.
    const match = /^data:([\w.+-]+\/[\w.+-]+)/.exec(value.slice(0, 100));
    const contentType = match?.[1];
    if (!contentType) return null;
    if (!PREVIEWABLE_TOP_LEVEL.has(contentType.split("/")[0]!)) return null;
    return { kind: "dataUri", contentType, src: value };
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    if (value.length > MAX_URL_LENGTH) return null;
    const contentType = mimeFromUrl(value);
    if (!contentType) return null;
    return { kind: "url", contentType, src: value };
  }

  return null;
}

function mimeFromUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const ext = pathname.split(".").pop()?.toLowerCase();
  if (!ext || ext === pathname) return null;
  return URL_EXTENSION_TO_MIME[ext] ?? null;
}
