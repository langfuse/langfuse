import { MediaReferenceStringSchema } from "@langfuse/shared";

const LANGFUSE_MEDIA_PREFIX = "@@@langfuseMedia:";
const LANGFUSE_MEDIA_REFERENCE_PATTERN = /@@@langfuseMedia:[^@]*@@@/g;
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

// Guards the per-value hot path: bail before parsing a URL out of long strings.
const MAX_URL_LENGTH = 2048;

// A data: payload can be many megabytes, so we only ever validate the head.
// This is comfortably longer than any real image/audio/video data-URI header
// (`data:<mediatype>(;param=value)*(;base64)?,` — typically well under 40
// chars) while keeping the regex cost bounded regardless of payload size.
const MAX_DATA_URI_HEADER_SCAN = 256;

// RFC 2397 data-URI header shape: `data:<type>/<subtype>(;<param>=<value>)*
// (;base64)?,`. The trailing comma that separates the header from the payload
// is MANDATORY — requiring it (and a well-formed parameter list up to it) is
// what stops ordinary strings that merely start with "data:image/…" from being
// mistaken for previewable media. The first capture group is the MIME type.
//
// The `i` flag matches the `;base64` token ASCII-case-insensitively, per the
// WHATWG data-URL spec (browsers accept `;BASE64,` / `;Base64,`). It does NOT
// widen which media is previewable: the top-level type is still gated by the
// lowercase `PREVIEWABLE_TOP_LEVEL` check below, so `data:IMAGE/PNG,…` remains
// non-previewable regardless of the flag.
const DATA_URI_HEADER_PATTERN =
  /^data:([\w.+-]+\/[\w.+-]+)(?:;[\w.+-]+=[^;,]*)*(?:;base64)?,/i;

/**
 * Classifies a string value as previewable media, or returns null. Pure and
 * cheap: a prefix check gates every branch so non-media strings (the common
 * case, possibly thousands per view) cost only a couple of `startsWith` calls.
 */
export function classifyMediaValue(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return null;

  if (value.startsWith(LANGFUSE_MEDIA_PREFIX)) {
    if (value.length > MAX_LANGFUSE_REFERENCE_LENGTH) return null;
    const parsed = MediaReferenceStringSchema.safeParse(value);
    if (!parsed.success) return null;
    return {
      kind: "langfuseRef" as const,
      contentType: parsed.data.type,
      mediaId: parsed.data.id,
      referenceString: parsed.data.referenceString,
    };
  }

  if (value.startsWith(DATA_URI_PREFIX)) {
    // Validate the head against the RFC 2397 shape — reading only the head,
    // since a base64 payload can be megabytes long. Requiring a well-formed
    // header terminated by its mandatory comma rejects prose / JSON strings
    // that happen to start with "data:image/…" (false positives that would
    // otherwise render a broken media chip and skip the normal truncation).
    const match = DATA_URI_HEADER_PATTERN.exec(
      value.slice(0, MAX_DATA_URI_HEADER_SCAN),
    );
    const contentType = match?.[1];
    if (!contentType) return null;
    if (!PREVIEWABLE_TOP_LEVEL.has(contentType.split("/")[0]!)) return null;
    return { kind: "dataUri" as const, contentType, src: value };
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    if (value.length > MAX_URL_LENGTH) return null;
    const contentType = mimeFromUrl(value);
    if (!contentType) return null;
    return { kind: "url" as const, contentType, src: value };
  }

  return null;
}

export type MediaDescriptor = NonNullable<
  ReturnType<typeof classifyMediaValue>
>;

export function splitStringByMediaReferences(value: string) {
  const segments: Array<
    | { type: "text"; value: string }
    | {
        type: "media";
        value: string;
        descriptor: MediaDescriptor;
      }
  > = [];
  let lastIndex = 0;

  for (const match of value.matchAll(LANGFUSE_MEDIA_REFERENCE_PATTERN)) {
    const reference = match[0];
    const index = match.index ?? 0;
    const descriptor = classifyMediaValue(reference);

    if (!descriptor) continue;

    if (index > lastIndex) {
      segments.push({ type: "text", value: value.slice(lastIndex, index) });
    }

    segments.push({ type: "media", value: reference, descriptor });
    lastIndex = index + reference.length;
  }

  if (segments.length === 0) {
    segments.push({ type: "text", value });
    return segments;
  }

  if (lastIndex < value.length) {
    segments.push({ type: "text", value: value.slice(lastIndex) });
  }

  return segments;
}

function mimeFromUrl(url: string) {
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
