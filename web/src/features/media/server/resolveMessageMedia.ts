import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import { env } from "@/src/env.mjs";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  type ChatMessage,
  getMediaParts,
  isStructuredContent,
} from "@langfuse/shared";

/**
 * Resolve Langfuse-stored media referenced by message content into inline
 * base64, just before the LLM call.
 *
 * This is the layer that owns "our storage": it loads each referenced media
 * row, validates it, downloads the raw bytes and base64-encodes them. The
 * provider-specific formatting happens later in `fetchLLMCompletion` (the single
 * conversion boundary), which only needs the resolved bytes — so the shared LLM
 * function stays free of DB/storage dependencies.
 *
 * The returned messages are a transient copy used only for the call; the
 * persisted/echoed messages keep the lightweight media references (no base64),
 * so caches and results remain small and a faithful record of what was sent.
 *
 * v1 supports images only; other media types are rejected with a clear error.
 */
export async function resolveMessageMedia(params: {
  projectId: string;
  messages: ChatMessage[];
}): Promise<ChatMessage[]> {
  const { projectId, messages } = params;

  // Collect referenced media ids (media parts only ever appear in array content).
  const mediaIds = new Set<string>();
  for (const message of messages) {
    if (!("content" in message)) continue;
    for (const part of getMediaParts(message.content)) {
      if (part.mediaId) mediaIds.add(part.mediaId);
    }
  }

  if (mediaIds.size === 0) return messages;

  // Resolve each unique media once, then fan the result back out to all parts.
  const base64ById = new Map<string, string>();
  const mimeById = new Map<string, string>();

  for (const mediaId of mediaIds) {
    const media = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });

    if (!media) {
      throw new LangfuseNotFoundError(`Media asset ${mediaId} not found`);
    }
    if (media.uploadHttpStatus !== 200) {
      throw new InvalidRequestError(
        `Media asset ${mediaId} has not finished uploading`,
      );
    }
    if (!media.contentType.startsWith("image/")) {
      throw new InvalidRequestError(
        `Unsupported media type ${media.contentType}. Only images can currently be sent to the model.`,
      );
    }
    if (
      Number(media.contentLength) > env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH
    ) {
      throw new InvalidRequestError(
        `Media asset ${mediaId} exceeds the maximum allowed size`,
      );
    }

    const bytes = await getMediaStorageServiceClient(
      media.bucketName,
    ).downloadBytes(media.bucketPath);

    base64ById.set(mediaId, Buffer.from(bytes).toString("base64"));
    mimeById.set(mediaId, media.contentType);
  }

  return messages.map((message) => {
    if (!("content" in message) || !isStructuredContent(message.content)) {
      return message;
    }

    const content = message.content.map((part) => {
      if (part.type !== "media") return part;
      const data = base64ById.get(part.mediaId);
      if (!data) return part;
      return {
        ...part,
        mimeType: mimeById.get(part.mediaId) ?? part.mimeType,
        data,
      };
    });

    return { ...message, content } as ChatMessage;
  });
}
