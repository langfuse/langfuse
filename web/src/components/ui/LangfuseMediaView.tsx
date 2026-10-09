/* eslint-disable @repo/no-null-render */
import { api } from "@/src/utils/api";
import { useMemo } from "react";

import { ImageOff } from "lucide-react";
import {
  MediaReferenceStringSchema,
  OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE,
  type ParsedMediaReferenceType,
} from "@langfuse/shared";
import { ResizableImage } from "@/src/components/ui/resizable-image";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  type MediaContentType,
  type MediaReturnType,
} from "@/src/features/media";
import { MediaReferenceTag } from "@/src/components/ui/media/MediaReferenceTag";
import { MediaFileView } from "@/src/components/ui/media/MediaFileView";
import { MediaAudioPlayer } from "@/src/components/ui/media/MediaAudioPlayer";
import { MediaVideoPlayer } from "@/src/components/ui/media/MediaVideoPlayer";
import { PREVIEW_AUTO_EXPAND_MAX_BYTES } from "@/src/components/ui/media/mediaConstants";

export const LangfuseMediaView = ({
  mediaReferenceString,
  mediaAPIReturnValue,
  variant = "inline",
}: {
  mediaReferenceString?: string | ParsedMediaReferenceType;
  mediaAPIReturnValue?: Omit<MediaReturnType, "field"> &
    Partial<Pick<MediaReturnType, "field">>;
  // How to render media:
  // - "inline": render previewable media (image/audio/video) in place and a
  //   file icon for the rest — for media embedded in content (markdown/JSON).
  // - "icon": a compact file tile that expands on click — for attachment lists.
  // - "preview": like "icon", but previewable media starts already expanded.
  // Non-previewable types (e.g. PDF) are always a click-to-open icon.
  variant?: "inline" | "icon" | "preview";
}) => {
  const mediaData = useMemo<{
    id: string;
    type: MediaContentType;
    referenceString?: string;
    source?: string;
  } | null>(() => {
    if (mediaReferenceString && typeof mediaReferenceString === "string") {
      const { success, data: parsedTag } =
        MediaReferenceStringSchema.safeParse(mediaReferenceString);
      if (success)
        return {
          id: parsedTag.id,
          type: parsedTag.type as MediaContentType,
          referenceString: parsedTag.referenceString,
          source: parsedTag.source,
        };
    } else if (
      mediaReferenceString &&
      typeof mediaReferenceString !== "string"
    ) {
      return {
        id: mediaReferenceString.id,
        type: mediaReferenceString.type as MediaContentType,
        referenceString: mediaReferenceString.referenceString,
        source: mediaReferenceString.source,
      };
    } else if (mediaAPIReturnValue) {
      return {
        id: mediaAPIReturnValue.mediaId,
        type: mediaAPIReturnValue.contentType,
      };
    }
    return null;
  }, [mediaReferenceString, mediaAPIReturnValue]);

  const projectId = useProjectIdFromURL();

  if (!mediaData) {
    const text = "Invalid Langfuse Media Tag";

    return (
      <div className="flex items-center gap-2">
        <span title={text}>
          <ImageOff className="icon-base" />
        </span>
        <span className="truncate text-sm" title={text}>
          {text}
        </span>
      </div>
    );
  }

  const isOversizedField =
    mediaData.source === OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE;

  const { data } = api.media.getById.useQuery(
    {
      mediaId: mediaData.id,
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId) && !isOversizedField,
      meta: { silentHttpCodes: [404] },
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 55 * 60 * 1000, // 55 minutes, s3 links expire after 1 hour
    },
  );

  if (isOversizedField && mediaData.referenceString) {
    return (
      <MediaReferenceTag
        descriptor={{
          kind: "langfuseRef",
          contentType: mediaData.type,
          mediaId: mediaData.id,
          referenceString: mediaData.referenceString,
          source: OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE,
        }}
      />
    );
  }

  const mediaUrl = data?.url;

  if (!mediaUrl) return null;

  if (variant === "icon" || variant === "preview") {
    const autoExpand =
      variant === "preview" &&
      (data?.contentLength ?? 0) <= PREVIEW_AUTO_EXPAND_MAX_BYTES;
    return (
      <MediaFileView
        src={mediaUrl}
        contentType={mediaData.type}
        defaultExpanded={autoExpand}
      />
    );
  }

  if (mediaData.type.startsWith("image")) {
    return (
      <ResizableImage
        src={mediaUrl}
        isDefaultVisible={true}
        shouldValidateImageSource={false}
      />
    );
  } else if (mediaData.type.startsWith("audio")) {
    return <MediaAudioPlayer src={mediaUrl} />;
  } else if (mediaData.type.startsWith("video")) {
    return <MediaVideoPlayer src={mediaUrl} />;
  }
  return <MediaFileView src={mediaUrl} contentType={mediaData.type} />;
};
