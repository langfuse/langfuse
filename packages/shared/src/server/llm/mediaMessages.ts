import type { FilePart, ModelMessage } from "ai";

import { env } from "../../env";
import { OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE } from "../../domain/media";
import { prisma } from "../../db";
import {
  MEDIA_REFERENCE_PATTERN,
  MediaReferenceStringSchema,
} from "../../utils/IORepresentation/chatML/types";
import { getS3MediaStorageClient } from "../s3";
import { mapChatMessagesToModelMessages } from "./ai-sdk/messages";
import { LLMValidationError } from "./errors";
import type { ChatMessage } from "./types";
import { LLMAdapter } from "./types";

const EVALUATOR_MEDIA_SIGNED_URL_TTL_SECONDS = 120;

const MEDIA_TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/x-aiff": "audio/aiff",
};

// Union of documented input formats across the main provider families. This
// only decides whether Langfuse turns a reference into a FilePart; the selected
// adapter/model remains authoritative and may reject a format.
// OpenAI: https://platform.openai.com/docs/guides/images-vision
// Anthropic: https://platform.claude.com/docs/en/build-with-claude/vision
// Gemini: https://ai.google.dev/gemini-api/docs/file-input-methods
const EVALUATOR_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/aac",
  "audio/flac",
  "audio/ogg",
  "audio/aiff",
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-flv",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/3gpp",
]);

export function normalizeEvaluatorMediaType(mediaType: string) {
  const normalized = mediaType.trim().toLowerCase();
  return MEDIA_TYPE_ALIASES[normalized] ?? normalized;
}

export function isEvaluatorMediaTypeSupported(mediaType: string) {
  return EVALUATOR_MEDIA_TYPES.has(normalizeEvaluatorMediaType(mediaType));
}

export type EvaluatorMediaTransport = "url" | "inline" | "disabled";

type ResolvedMedia = {
  url: string;
  mediaType: string;
  contentLength?: number;
  bucketName?: string;
  bucketPath?: string;
};
export type EvaluatorMediaResolver = (params: {
  projectId: string;
  mediaId: string;
  mediaType: string;
}) => Promise<ResolvedMedia | null>;

/**
 * Resolves a Langfuse media id only inside its owning project and signs the
 * stored object without downloading it through the Langfuse server.
 */
export const resolveProjectMedia: EvaluatorMediaResolver = async ({
  projectId,
  mediaId,
  mediaType,
}) => {
  const media = await prisma.media.findUnique({
    where: { projectId_id: { projectId, id: mediaId } },
  });
  if (
    !media ||
    (media.uploadHttpStatus !== 200 && media.uploadHttpStatus !== 201)
  ) {
    return null;
  }

  const storedMediaType = normalizeEvaluatorMediaType(media.contentType);
  if (
    !EVALUATOR_MEDIA_TYPES.has(storedMediaType) ||
    storedMediaType !== normalizeEvaluatorMediaType(mediaType)
  ) {
    throw new LLMValidationError({
      code: "invalid-request",
      message: `Media asset ${mediaId} does not match the referenced media type`,
    });
  }

  const url = await getS3MediaStorageClient(media.bucketName).getSignedUrl(
    media.bucketPath,
    EVALUATOR_MEDIA_SIGNED_URL_TTL_SECONDS,
    false,
  );
  return {
    url,
    mediaType: storedMediaType,
    contentLength: Number(media.contentLength),
    bucketName: media.bucketName,
    bucketPath: media.bucketPath,
  };
};

export function resolveEvaluatorMediaTransport(params: {
  configured: EvaluatorMediaTransport | undefined;
  cloudRegion: string | undefined;
}): EvaluatorMediaTransport {
  if (params.configured) return params.configured;
  return params.cloudRegion ? "url" : "inline";
}

async function fetchMediaBytes(
  url: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Media download failed with status ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Media download exceeds the inline byte limit");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new Error("Media download exceeds the inline byte limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Maps Langfuse chat messages to AI SDK messages. After adapter-specific role
 * normalization, URL and inline modes expand supported media references in
 * user and assistant text into ordered FileParts. Other roles remain plain
 * text. Disabled mode leaves every reference as plain text and performs no
 * media lookup.
 */
export async function compileLangfuseMediaMessages(params: {
  projectId: string;
  messages: ChatMessage[];
  adapter: LLMAdapter;
  transport?: EvaluatorMediaTransport;
  resolveMedia?: EvaluatorMediaResolver;
  fetchMedia?: (url: string) => Promise<Uint8Array>;
  maxInlineMediaBytes?: number;
}): Promise<{
  providerMessages: ModelMessage[];
  traceMessages: Array<{ role: string; content: unknown }>;
}> {
  const transport =
    params.transport ??
    resolveEvaluatorMediaTransport({
      configured: env.LANGFUSE_EVALUATOR_MEDIA_TRANSPORT,
      cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    });
  if (transport === "disabled") {
    const messages = mapChatMessagesToModelMessages(params.messages, {
      adapter: params.adapter,
    });
    return { providerMessages: messages, traceMessages: messages };
  }

  // Normalize roles and tool messages before adding media parts so the final
  // payload follows the selected adapter's message contract.
  const modelMessages = mapChatMessagesToModelMessages(params.messages, {
    adapter: params.adapter,
  });
  const resolveMedia = params.resolveMedia ?? resolveProjectMedia;
  const maxInlineMediaBytes =
    params.maxInlineMediaBytes ?? env.LANGFUSE_EVALUATOR_MEDIA_INLINE_MAX_BYTES;
  const fetchMedia =
    params.fetchMedia ??
    ((url: string) => fetchMediaBytes(url, maxInlineMediaBytes));

  // Compile independent messages concurrently. Media references within each
  // message are also resolved in parallel below.
  const compiledMessages = await Promise.all(
    modelMessages.map(async (message) => {
      if (typeof message.content !== "string") {
        return { providerMessage: message, traceMessage: message };
      }
      if (message.role !== "user" && message.role !== "assistant") {
        return { providerMessage: message, traceMessage: message };
      }

      // Trace content retains Langfuse references, while supported references
      // are expanded only in the provider-bound payload.
      const traceContent = buildTraceContent(message.content);
      const matches = getSupportedReferences(message.content);
      if (matches.length === 0) {
        return {
          providerMessage: message,
          traceMessage: { ...message, content: traceContent },
        };
      }

      // Resolve and load independent media objects concurrently. Promise.all
      // keeps the results in source order even if downloads finish out of order.
      const resolvedFiles = await Promise.all(
        matches.map(async (match) => {
          const resolved = await resolveMedia({
            projectId: params.projectId,
            mediaId: match.id,
            mediaType: match.mediaType,
          });
          if (!resolved) {
            throw new LLMValidationError({
              code: "invalid-request",
              message: `Media asset ${match.id} was not found in this project`,
            });
          }

          let data: URL | Uint8Array;
          if (transport === "url") {
            data = new URL(resolved.url);
          } else {
            try {
              if (
                resolved.contentLength !== undefined &&
                resolved.contentLength > maxInlineMediaBytes
              ) {
                throw new Error("Media object exceeds the inline byte limit");
              }
              data =
                !params.fetchMedia && resolved.bucketName && resolved.bucketPath
                  ? await getS3MediaStorageClient(
                      resolved.bucketName,
                    ).downloadBytes(resolved.bucketPath)
                  : await fetchMedia(resolved.url);
              if (data.byteLength > maxInlineMediaBytes) {
                throw new Error("Media download exceeds the inline byte limit");
              }
            } catch (cause) {
              throw new LLMValidationError({
                code: "invalid-request",
                message: `Media asset ${match.id} could not be loaded for inline model input`,
                cause,
              });
            }
          }

          return {
            match,
            file: {
              type: "file",
              data,
              mediaType: normalizeEvaluatorMediaType(resolved.mediaType),
            } satisfies FilePart,
          };
        }),
      );

      // Rebuild the mixed text/file content after loading so the original
      // message order is independent of download completion order.
      const content: Array<FilePart | { type: "text"; text: string }> = [];
      let cursor = 0;
      for (const { match, file } of resolvedFiles) {
        if (match.index > cursor) {
          content.push({
            type: "text",
            text: message.content.slice(cursor, match.index),
          });
        }
        content.push(file);
        cursor = match.index + match.referenceString.length;
      }
      if (cursor < message.content.length) {
        content.push({
          type: "text",
          text: message.content.slice(cursor),
        });
      }

      return {
        providerMessage:
          message.role === "user"
            ? ({ role: "user", content } satisfies ModelMessage)
            : ({ role: "assistant", content } satisfies ModelMessage),
        traceMessage: { role: message.role, content: traceContent },
      };
    }),
  );

  return {
    providerMessages: compiledMessages.map(
      ({ providerMessage }) => providerMessage,
    ),
    traceMessages: compiledMessages.map(({ traceMessage }) => traceMessage),
  };
}

type SupportedReference = {
  index: number;
  id: string;
  mediaType: string;
  referenceString: string;
};

type TraceContentPart =
  | { type: "text"; text: string }
  | { type: "file"; data: string; mediaType: string };

function buildTraceContent(content: string): string | TraceContentPart[] {
  const parts: TraceContentPart[] = [];
  let cursor = 0;

  for (const match of content.matchAll(
    new RegExp(MEDIA_REFERENCE_PATTERN.source, MEDIA_REFERENCE_PATTERN.flags),
  )) {
    const parsed = MediaReferenceStringSchema.safeParse(match[0]);
    if (!parsed.success || match.index === undefined) continue;
    if (match.index > cursor) {
      parts.push({ type: "text", text: content.slice(cursor, match.index) });
    }
    parts.push({
      type: "file",
      data: match[0],
      mediaType: normalizeEvaluatorMediaType(parsed.data.type),
    });
    cursor = match.index + match[0].length;
  }

  if (parts.length === 0) return content;
  if (cursor < content.length) {
    parts.push({ type: "text", text: content.slice(cursor) });
  }
  return parts;
}

function getSupportedReferences(content: string): SupportedReference[] {
  const references: SupportedReference[] = [];
  for (const match of content.matchAll(
    new RegExp(MEDIA_REFERENCE_PATTERN.source, MEDIA_REFERENCE_PATTERN.flags),
  )) {
    const parsed = MediaReferenceStringSchema.safeParse(match[0]);
    if (!parsed.success || match.index === undefined) continue;
    const mediaType = normalizeEvaluatorMediaType(parsed.data.type);
    if (
      !EVALUATOR_MEDIA_TYPES.has(mediaType) ||
      parsed.data.source === OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE
    )
      continue;
    references.push({
      index: match.index,
      id: parsed.data.id,
      mediaType,
      referenceString: match[0],
    });
  }
  return references;
}
