import type { FilePart, ModelMessage, UserContent } from "ai";

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
import { ChatMessageRole, LLMAdapter } from "./types";

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
    60,
    false,
  );
  return {
    url,
    mediaType: storedMediaType,
    contentLength: Number(media.contentLength),
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
 * Maps Langfuse chat messages to AI SDK messages. URL and inline modes expand
 * supported media references in user text into ordered FileParts and reject
 * them in system/assistant messages. Disabled mode leaves every reference as
 * plain text and performs no media lookup.
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

  const supportedReferencesByContent = new Map<string, SupportedReference[]>();
  for (const message of params.messages) {
    if (
      typeof message.content === "string" &&
      !supportedReferencesByContent.has(message.content)
    ) {
      supportedReferencesByContent.set(
        message.content,
        getSupportedReferences(message.content),
      );
    }
  }
  assertMediaOnlyInUserMessages(params.messages, supportedReferencesByContent);

  const modelMessages = mapChatMessagesToModelMessages(params.messages, {
    adapter: params.adapter,
  });
  const resolveMedia = params.resolveMedia ?? resolveProjectMedia;
  const maxInlineMediaBytes =
    params.maxInlineMediaBytes ?? env.LANGFUSE_EVALUATOR_MEDIA_INLINE_MAX_BYTES;
  const fetchMedia =
    params.fetchMedia ??
    ((url: string) => fetchMediaBytes(url, maxInlineMediaBytes));

  const compiledMessages = await Promise.all(
    modelMessages.map(async (message) => {
      if (message.role !== "user" || typeof message.content !== "string") {
        return { providerMessage: message, traceMessage: message };
      }

      const matches = supportedReferencesByContent.get(message.content) ?? [];
      if (matches.length === 0) {
        return { providerMessage: message, traceMessage: message };
      }

      const content: UserContent = [];
      const traceContent: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: string; mediaType: string }
      > = [];
      let cursor = 0;
      for (const match of matches) {
        if (match.index > cursor) {
          const text = message.content.slice(cursor, match.index);
          content.push({ type: "text", text });
          traceContent.push({ type: "text", text });
        }
        traceContent.push({
          type: "file",
          data: match.referenceString,
          mediaType: match.mediaType,
        });
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
            data = await fetchMedia(resolved.url);
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
        content.push({
          type: "file",
          data,
          mediaType: normalizeEvaluatorMediaType(resolved.mediaType),
        } satisfies FilePart);
        cursor = match.index + match.referenceString.length;
      }
      if (cursor < message.content.length) {
        const text = message.content.slice(cursor);
        content.push({ type: "text", text });
        traceContent.push({ type: "text", text });
      }

      return {
        providerMessage: { role: "user" as const, content },
        traceMessage: { role: "user", content: traceContent },
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

function assertMediaOnlyInUserMessages(
  messages: ChatMessage[],
  supportedReferencesByContent: Map<string, SupportedReference[]>,
) {
  for (const message of messages) {
    if (
      (message.role === ChatMessageRole.System ||
        message.role === ChatMessageRole.Assistant) &&
      typeof message.content === "string" &&
      (supportedReferencesByContent.get(message.content)?.length ?? 0) > 0
    ) {
      throw new LLMValidationError({
        code: "invalid-request",
        message: `Supported media references are not allowed in ${message.role} evaluator messages`,
      });
    }
  }
}

type SupportedReference = {
  index: number;
  id: string;
  mediaType: string;
  referenceString: string;
};

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
