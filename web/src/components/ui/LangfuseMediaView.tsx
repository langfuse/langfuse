import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";

import { ImageOff } from "lucide-react";
import {
  MediaReferenceStringSchema,
  type ParsedMediaReferenceType,
} from "@langfuse/shared";
import {
  COMPACT_IMAGE_MAX_HEIGHT_REM,
  ResizableImage,
} from "@/src/components/ui/resizable-image";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  type MediaContentType,
  type MediaReturnType,
} from "@/src/features/media/validation";
import {
  ExternalLink,
  File,
  Image as ImageIcon,
  Video,
  Volume2,
} from "lucide-react";

// Above this, "preview" media falls back to the click-to-open icon instead of
// rendering inline, so a large file isn't fetched/decoded just by opening a view.
const PREVIEW_AUTO_EXPAND_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

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
  let mediaData: { id: string; type: MediaContentType } | null = null;

  const projectId = useProjectIdFromURL();

  if (mediaReferenceString && typeof mediaReferenceString === "string") {
    const { success, data: parsedTag } =
      MediaReferenceStringSchema.safeParse(mediaReferenceString);
    if (success)
      mediaData = {
        id: parsedTag.id,
        type: parsedTag.type as MediaContentType,
      };
  } else if (mediaReferenceString && typeof mediaReferenceString !== "string") {
    mediaData = {
      id: mediaReferenceString.id,
      type: mediaReferenceString.type as MediaContentType,
    };
  } else if (mediaAPIReturnValue) {
    mediaData = {
      id: mediaAPIReturnValue.mediaId,
      type: mediaAPIReturnValue.contentType,
    };
  }

  if (!mediaData) {
    const text = "Invalid Langfuse Media Tag";

    return (
      <div className="flex items-center gap-2">
        <span title={text}>
          <ImageOff className="h-4 w-4" />
        </span>
        <span className="truncate text-sm" title={text}>
          {text}
        </span>
      </div>
    );
  }

  const { data } = api.media.getById.useQuery(
    {
      mediaId: mediaData.id,
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 55 * 60 * 1000, // 55 minutes, s3 links expire after 1 hour
    },
  );

  const mediaUrl = data?.url;

  if (!mediaUrl) return null;

  if (variant === "icon" || variant === "preview") {
    const autoExpand =
      variant === "preview" &&
      (data?.contentLength ?? 0) <= PREVIEW_AUTO_EXPAND_MAX_BYTES;
    return (
      <FileViewer
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
    return <AudioPlayer src={mediaUrl} />;
  } else if (mediaData.type.startsWith("video")) {
    return <VideoPlayer src={mediaUrl} />;
  }
  return <FileViewer src={mediaUrl} contentType={mediaData.type} />;
};

function FileViewer({
  src,
  contentType,
  defaultExpanded = false,
}: {
  src?: string;
  contentType: MediaContentType;
  defaultExpanded?: boolean;
}) {
  const mimeType = String(contentType);
  const fileType = mimeType.split("/")[0];
  const isImage = fileType === "image";
  const isAudio = fileType === "audio";
  const isVideo = fileType === "video";
  const isPreviewable = isImage || isAudio || isVideo;

  const [isExpanded, setIsExpanded] = useState(
    defaultExpanded && isPreviewable,
  );
  const [compactImageWidth, setCompactImageWidth] = useState<string>();

  if (!src) return null;

  const fileName = src.split("/").pop()?.split("?")[0] || "";
  const fileExtension = mimeType.split("/")[1]?.toUpperCase() || "FILE";

  const openInNewTab = () => {
    window.open(src, "_blank", "noopener,noreferrer");
  };

  const expandPreview = () => {
    if (!isImage || compactImageWidth) {
      setIsExpanded(true);
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      const { naturalWidth, naturalHeight } = image;
      if (naturalWidth && naturalHeight) {
        setCompactImageWidth(
          `${COMPACT_IMAGE_MAX_HEIGHT_REM * (naturalWidth / naturalHeight)}rem`,
        );
      }
      setIsExpanded(true);
    };
    image.onerror = () => setIsExpanded(true);
    image.src = src;
  };

  const iconTile = (
    <div className="flex flex-col items-center gap-2">
      {isImage ? (
        <ImageIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
      ) : isAudio ? (
        <Volume2 className="h-5 w-5 transition-transform group-hover:scale-110" />
      ) : isVideo ? (
        <Video className="h-5 w-5 transition-transform group-hover:scale-110" />
      ) : (
        <File className="h-5 w-5 transition-transform group-hover:scale-110" />
      )}

      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium">{fileExtension}</span>
        <span className="text-muted-foreground text-xs">
          {fileName.length > 5 ? `${fileName.slice(0, 5)}...` : fileName}
        </span>
      </div>
    </div>
  );

  const previewContent = isImage ? (
    <ResizableImage
      src={src}
      alt={fileName}
      isDefaultVisible={true}
      shouldValidateImageSource={false}
      fitContent
      compactWidth={compactImageWidth}
    />
  ) : isAudio ? (
    <AudioPlayer src={src} />
  ) : isVideo ? (
    <VideoPlayer src={src} />
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isPreviewable && isExpanded ? "basis-full" : "shrink-0",
      )}
    >
      {isPreviewable && isExpanded ? (
        <div className="flex max-w-3xl items-start gap-2">
          <div className={cn(isImage ? "contents" : "min-w-0 flex-1")}>
            {isAudio ? (
              <div className="max-w-xl min-w-72">{previewContent}</div>
            ) : (
              previewContent
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={openInNewTab}
            aria-label={`Open ${fileName} in new tab`}
            title={`Open ${fileName} in new tab`}
            className="shrink-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (isPreviewable ? expandPreview() : openInNewTab())}
          aria-label={
            isPreviewable
              ? `Show ${fileName} inline`
              : `Open ${fileName} in new tab`
          }
          aria-expanded={isPreviewable ? isExpanded : undefined}
          title={fileName}
          className="from-accent-light-green/30 to-muted hover:from-accent-light-green/40 hover:to-muted/90 dark:from-accent-dark-green/20 dark:to-muted dark:hover:from-accent-dark-green/30 group relative flex h-24 w-24 flex-col items-center justify-center gap-2 rounded-md border bg-linear-to-br px-2 transition-colors"
        >
          {iconTile}
        </button>
      )}
    </div>
  );
}

function AudioPlayer({ src }: { src?: string }) {
  if (!src) return null;

  return (
    <audio controls className="w-full" preload="metadata">
      <source src={src} />
      Your browser does not support the audio element.
    </audio>
  );
}

function VideoPlayer({ src }: { src?: string }) {
  if (!src) return null;

  return (
    <video controls className="w-full" preload="metadata" playsInline>
      <source src={src} />
      Your browser does not support the video element.
    </video>
  );
}
