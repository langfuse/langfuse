import { api } from "@/src/utils/api";

import { ImageOff } from "lucide-react";
import {
  MediaReferenceStringSchema,
  type ParsedMediaReferenceType,
} from "@/src/components/schemas/ChatMlSchema";
import { ResizableImage } from "@/src/components/ui/resizable-image";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  type MediaContentType,
  type MediaReturnType,
} from "@/src/features/media/validation";
import { File, Image as ImageIcon, Volume2 } from "lucide-react";

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

  if (!mediaData)
    return (
      <div className="flex items-center gap-2">
        <span title="Invalid Langfuse Media Tag">
          <ImageOff className="h-4 w-4" />
        </span>
        <span className="truncate text-sm">Invalid Langfuse Media Tag</span>
      </div>
    );

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

  if (mediaData.type.startsWith("image")) {
    return (
      <div>
        <ResizableImage
          src={mediaUrl}
          isDefaultVisible={true}
          shouldValidateImageSource={false}
        />
      </div>
    );
  } else if (mediaData.type.startsWith("audio")) {
    return <AudioPlayer src={mediaUrl} />;
  } else if (mediaData.type.startsWith("video")) {
    return <VideoPlayer src={mediaUrl} />;
  } else {
    return <FileViewer src={mediaUrl} contentType={mediaData.type} />;
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

  const mimeType = String(contentType);

  const fileName = src.split("/").pop()?.split("?")[0] || "";
  const fileType = mimeType.split("/")[0];
  const fileExtension = mimeType.split("/")[1]?.toUpperCase() || "FILE";

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
          <Volume2 className="h-5 w-5 transition-transform group-hover:scale-110" />
        ) : (
          <File className="h-5 w-5 transition-transform group-hover:scale-110" />
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

function VideoPlayer({ src }: { src?: string }) {
  if (!src) return null;

  return (
    <video controls className="w-full" preload="metadata" playsInline>
      <source src={src} />
      Your browser does not support the video element.
    </video>
  );
}
