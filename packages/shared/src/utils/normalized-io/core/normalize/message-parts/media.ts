import {
  MEDIA_REFERENCE_PATTERN,
  MediaReferenceStringSchema,
} from "../../../../../utils/IORepresentation/chatML/types";
import { compact, toProviderMetadata } from "../../utils/json";
import type { FilePart, NormalizedMessagePart } from "../../../types";

/**
 * Generic media and file builders: Langfuse media-token parsing, data-URI
 * prefix sniffing (RFC 2397), and plain url parts. No provider vocabulary —
 * per-dialect file builders live in their convention files.
 */

export type ParsedMediaReference = {
  type: string;
  id: string;
  source: string;
  referenceString: string;
};

// Cheap substring pre-check so token-free strings (nearly all) never pay
// for regex scans.
const MEDIA_TOKEN_HINT = "@@@langfuseMedia";

export function parseMediaReference(
  value: unknown,
): ParsedMediaReference | undefined {
  if (typeof value !== "string" || !value.includes(MEDIA_TOKEN_HINT)) {
    return undefined;
  }

  const matches = value.match(MEDIA_REFERENCE_PATTERN) ?? [];
  if (matches.length !== 1 || matches[0] !== value) return undefined;

  const parsed = MediaReferenceStringSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function filePartFromMediaReference(
  reference: ParsedMediaReference,
  extras?: Record<string, unknown>,
): FilePart {
  return compact<FilePart>({
    type: "file",
    mediaType: reference.type,
    content: { kind: "reference", id: reference.id },
    providerMetadata: toProviderMetadata({
      source: reference.source,
      ...extras,
    }),
  });
}

/**
 * Split a string into interleaved text and file parts, one file part per
 * embedded media reference token — strings frequently carry several.
 */
export function normalizeMediaPartsFromString(
  value: string,
): NormalizedMessagePart[] {
  if (!value.includes(MEDIA_TOKEN_HINT)) return [{ type: "text", text: value }];

  const parts: NormalizedMessagePart[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(MEDIA_REFERENCE_PATTERN)) {
    const parsed = parseMediaReference(match[0]);
    if (!parsed) continue; // stays part of the surrounding text

    const before = value.slice(lastIndex, match.index);
    if (before.trim().length > 0) parts.push({ type: "text", text: before });
    parts.push(filePartFromMediaReference(parsed));
    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return [{ type: "text", text: value }];

  const rest = value.slice(lastIndex);
  if (rest.trim().length > 0) parts.push({ type: "text", text: rest });
  return parts;
}

/**
 * Read the media type a data-URI declares in its prefix, without touching
 * the payload. Raw data-URIs only reach stored IO when upstream media
 * processing skipped or failed; decoding them stays the media pipeline's job.
 */
export function mediaTypeFromDataUri(url: string): string | undefined {
  if (!url.startsWith("data:")) return undefined;
  const end = url.slice(5).search(/[;,]/);
  return end > 0 ? url.slice(5, 5 + end) : undefined;
}

export type UrlFilePartOptions = {
  /** Explicit media type declared by the source (wins over sniffing). */
  mediaType?: string;
  /** Modality wildcard to apply when nothing better is known. */
  fallbackMediaType?: string;
  extras?: Record<string, unknown>;
};

/**
 * Media-token check -> data-URI prefix sniff -> plain url. Shared by every
 * url-bearing media field (chat image_url, Responses input_image, Anthropic
 * url sources).
 */
export function filePartFromUrl(
  url: string,
  options: UrlFilePartOptions = {},
): FilePart {
  const reference = parseMediaReference(url);
  if (reference) return filePartFromMediaReference(reference, options.extras);

  return compact<FilePart>({
    type: "file",
    mediaType:
      options.mediaType ??
      mediaTypeFromDataUri(url) ?? // Q: can I not remove this? vercel ai specific
      options.fallbackMediaType,
    content: { kind: "url", url },
    providerMetadata: options.extras
      ? toProviderMetadata(options.extras)
      : undefined,
  });
}
