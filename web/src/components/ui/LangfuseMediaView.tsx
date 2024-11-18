import { api } from "@/src/utils/api";

import { ImageOff } from "lucide-react";
import {
  MediaReferenceStringSchema,
  ParsedMediaReferenceType,
} from "@/src/components/schemas/ChatMlSchema";
import { ResizableImage } from "@/src/components/ui/resizable-image";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  MediaContentType,
  MediaReturnType,
} from "@/src/features/media/validation";
import { FileIcon, ImageIcon, SpeakerLoudIcon } from "@radix-ui/react-icons";

export const LangfuseMediaView = ({
  mediaReferenceString,
  mediaAPIReturnValue,
  asFileIcon = false,
}: {
  mediaReferenceString?: string | ParsedMediaReferenceType;
  mediaAPIReturnValue?: MediaReturnType;
  asFileIcon?: boolean;
}) => {
  let mediaData: { id: string; type: MediaContentType } | null = null;

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

  if (!mediaData)
    return (
      <div className="flex items-center gap-2">
        <span title="Invalid Langfuse Media Tag">
          <ImageOff className="h-4 w-4" />
        </span>
        <span className="truncate text-sm">Invalid Langfuse Media Tag</span>
      </div>
    );

  const projectId = useProjectIdFromURL();

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

  if (asFileIcon) {
    return <FileViewer src={mediaUrl} contentType={mediaData.type} />;
  }

  switch (mediaData.type) {
    case MediaContentType.JPEG:
    case MediaContentType.PNG:
    case MediaContentType.WEBP:
      return (
        <div>
          <ResizableImage
            src={mediaUrl}
            isDefaultVisible={true}
            shouldValidateImageSource={false}
          />
        </div>
      );
    case MediaContentType.MP3:
    case MediaContentType.MP3_LEGACY:
    case MediaContentType.WAV:
      return <AudioPlayer src={mediaUrl} />;

    case MediaContentType.PDF:
      return <FileViewer src={mediaUrl} contentType={mediaData.type} />;

    case MediaContentType.TXT:
      return <FileViewer src={mediaUrl} contentType={mediaData.type} />;

    default:
      return null;
  }
};

function FileViewer({
  src,
  contentType,
}: {
  src?: string;
  contentType: MediaContentType;
}) {
  if (!src) return null;

  const fileName = src.split("/").pop()?.split("?")[0] || "";
  const fileType = contentType.split("/")[0];
  const fileExtension = contentType.split("/")[1].toUpperCase();

  const openInNewTab = () => {
    window.open(src, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={openInNewTab}
      aria-label={`Open ${fileName} in new tab`}
      title={fileName}
      className="group relative flex h-24 w-24 flex-col items-center justify-center gap-2 rounded-md border bg-gradient-to-br from-accent-light-green/30 to-muted px-2 transition-colors hover:from-accent-light-green/40 hover:to-muted/90 dark:from-accent-dark-green/20 dark:to-muted dark:hover:from-accent-dark-green/30"
    >
      <div className="flex flex-col items-center gap-2">
        {fileType === "image" ? (
          <ImageIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
        ) : fileType === "audio" ? (
          <SpeakerLoudIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
        ) : (
          <FileIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
        )}

        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-medium">{fileExtension}</span>
          <span className="text-xs text-muted-foreground">
            {fileName.length > 5 ? `${fileName.slice(0, 5)}...` : fileName}
          </span>
        </div>
      </div>
    </button>
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
