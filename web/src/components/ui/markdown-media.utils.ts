import {
  MediaReferenceStringSchema,
  isOpenAIImageContentPart,
  type OpenAIContentSchema,
  type OpenAIOutputAudioType,
  type ParsedMediaReferenceType,
} from "@langfuse/shared";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type z } from "zod";

const MEDIA_REFERENCE_PATTERN = /@@@langfuseMedia:[\s\S]*?@@@/g;

const getMediaReferenceId = (
  value: string | ParsedMediaReferenceType | null | undefined,
): string | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const parsedReference = MediaReferenceStringSchema.safeParse(value);
    return parsedReference.success ? parsedReference.data.id : null;
  }

  return typeof value.id === "string" ? value.id : null;
};

export const getStandaloneMediaReferenceStrings = (value: string): string[] => {
  const matches = value.match(MEDIA_REFERENCE_PATTERN) ?? [];
  if (matches.length === 0) return [];

  const remainingText = value.replace(MEDIA_REFERENCE_PATTERN, "").trim();
  if (remainingText.length > 0) return [];

  const parsedMatches = matches.map((match) =>
    MediaReferenceStringSchema.safeParse(match),
  );

  return parsedMatches.every((result) => result.success) ? matches : [];
};

export const getRenderedInlineMediaIds = ({
  markdown,
  audio,
}: {
  markdown: string | z.infer<typeof OpenAIContentSchema>;
  audio?: OpenAIOutputAudioType;
}): Set<string> => {
  const mediaIds = new Set<string>();

  if (typeof markdown === "string") {
    getStandaloneMediaReferenceStrings(markdown).forEach((referenceString) => {
      const mediaId = getMediaReferenceId(referenceString);
      if (mediaId) {
        mediaIds.add(mediaId);
      }
    });
  } else {
    (markdown ?? []).forEach((content) => {
      if (isOpenAIImageContentPart(content)) {
        const mediaId = getMediaReferenceId(content.image_url.url);
        if (mediaId) {
          mediaIds.add(mediaId);
        }
      } else if (content.type === "input_audio") {
        const mediaId = getMediaReferenceId(content.input_audio.data);
        if (mediaId) {
          mediaIds.add(mediaId);
        }
      }
    });
  }

  if (audio) {
    const mediaId = getMediaReferenceId(audio.data.referenceString);
    if (mediaId) {
      mediaIds.add(mediaId);
    }
  }

  return mediaIds;
};

export const filterAlreadyRenderedMedia = (
  media: MediaReturnType[] | undefined,
  renderedMediaIds: Set<string>,
): MediaReturnType[] =>
  (media ?? []).filter((item) => !renderedMediaIds.has(item.mediaId));
