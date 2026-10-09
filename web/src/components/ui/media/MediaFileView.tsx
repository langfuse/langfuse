import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { MediaFileCard } from "@/src/components/MediaFileCard/MediaFileCard";
import { Button } from "@/src/components/ui/button";
import { MediaAudioPlayer } from "@/src/components/ui/media/MediaAudioPlayer";
import { MediaVideoPlayer } from "@/src/components/ui/media/MediaVideoPlayer";
import {
  COMPACT_IMAGE_MAX_HEIGHT_REM,
  ResizableImage,
} from "@/src/components/ui/resizable-image";
import { type MediaContentType } from "@/src/features/media";
import { cn } from "@/src/utils/tailwind";

export type MediaFileViewProps = {
  src: string;
  contentType: MediaContentType;
  defaultExpanded?: boolean;
  onPreviewError?: () => void;
  onPreviewRequest?: () => void;
};

export function MediaFileView({
  src,
  contentType,
  defaultExpanded = false,
  onPreviewError,
  onPreviewRequest,
}: MediaFileViewProps) {
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
  const fileName = src.split("/").pop()?.split("?")[0] || "";

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
  const handleFileCardClick = () => {
    if (isPreviewable) {
      onPreviewRequest?.();
      expandPreview();
      return;
    }
    openInNewTab();
  };

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
            <MediaFilePreview
              src={src}
              fileName={fileName}
              fileType={fileType as MediaFilePreviewProps["fileType"]}
              compactImageWidth={compactImageWidth}
              onError={onPreviewError}
            />
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
            <ExternalLink className="icon-base text-icon-foreground" />
          </Button>
        </div>
      ) : (
        <MediaFileCard
          contentType={contentType}
          fileName={fileName}
          onClick={handleFileCardClick}
        />
      )}
    </div>
  );
}

function MediaFilePreview({
  src,
  fileName,
  fileType,
  compactImageWidth,
  onError,
}: MediaFilePreviewProps) {
  if (fileType === "image") {
    return (
      <ResizableImage
        src={src}
        alt={fileName}
        isDefaultVisible={true}
        shouldValidateImageSource={false}
        fitContent
        compactWidth={compactImageWidth}
      />
    );
  }

  if (fileType === "audio") {
    return (
      <div className="max-w-xl min-w-72">
        <MediaAudioPlayer src={src} onError={onError} />
      </div>
    );
  }

  return <MediaVideoPlayer src={src} onError={onError} />;
}

type MediaFilePreviewProps = {
  src: string;
  fileName: string;
  fileType: "image" | "audio" | "video";
  compactImageWidth?: string;
  onError?: () => void;
};
