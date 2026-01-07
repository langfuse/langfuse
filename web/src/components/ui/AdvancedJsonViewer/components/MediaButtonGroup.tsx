import { useMemo, useState, useRef } from "react";
import { type MediaReturnType } from "@/src/features/media/validation";
import { File, Image as ImageIcon, Volume2, Video } from "lucide-react";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

export interface MediaButtonGroupProps {
  media: MediaReturnType[];
}

type MediaCategory = "image" | "audio" | "video" | "document";

interface GroupedMedia {
  category: MediaCategory;
  items: MediaReturnType[];
  icon: typeof ImageIcon;
}

/**
 * AudioPlayer - Renders HTML5 audio player with controls
 */
function AudioPlayer({ src }: { src?: string }) {
  if (!src) return null;

  return (
    <audio controls className="w-full" preload="metadata">
      <source src={src} />
      Your browser does not support the audio element.
    </audio>
  );
}

/**
 * VideoPlayer - Renders HTML5 video player with controls
 */
function VideoPlayer({ src }: { src?: string }) {
  if (!src) return null;

  return (
    <video controls className="w-full" preload="metadata" playsInline>
      <source src={src} />
      Your browser does not support the video element.
    </video>
  );
}

/**
 * ImagePreview - Renders 96x96px image that opens in new tab when clicked
 */
function ImagePreview({ src }: { src?: string }) {
  if (!src) return null;

  const openInNewTab = () => {
    window.open(src, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={openInNewTab}
      className="h-24 w-24 overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-80"
      aria-label="Open image in new tab"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Media preview"
        className="h-full w-full object-cover"
      />
    </button>
  );
}

/**
 * MediaPreview - Renders media preview based on content type
 */
function MediaPreview({ mediaItem }: { mediaItem: MediaReturnType }) {
  const projectId = useProjectIdFromURL();

  const { data } = api.media.getById.useQuery(
    {
      mediaId: mediaItem.mediaId,
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

  const contentType = mediaItem.contentType;

  if (contentType.startsWith("image")) {
    return <ImagePreview src={mediaUrl} />;
  } else if (contentType.startsWith("audio")) {
    return <AudioPlayer src={mediaUrl} />;
  } else if (contentType.startsWith("video")) {
    return <VideoPlayer src={mediaUrl} />;
  } else {
    // Documents: use file icon view
    return (
      <LangfuseMediaView mediaAPIReturnValue={mediaItem} asFileIcon={true} />
    );
  }
}

/**
 * MediaButtonGroup - Displays media attachment buttons grouped by type
 *
 * Shown in section headers to indicate presence of media attachments.
 * Groups media by category (image/audio/video/document) and shows count badges.
 * Shows popover on hover; click to keep it open.
 */
export function MediaButtonGroup({ media }: MediaButtonGroupProps) {
  const [openCategory, setOpenCategory] = useState<MediaCategory | null>(null);
  const [clickedCategory, setClickedCategory] = useState<MediaCategory | null>(
    null,
  );
  const justClickedRef = useRef<MediaCategory | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Group media by category
  const groupedMedia = useMemo(() => {
    const groups: GroupedMedia[] = [];

    const imageMedia = media.filter((m) => m.contentType.startsWith("image"));
    const audioMedia = media.filter((m) => m.contentType.startsWith("audio"));
    const videoMedia = media.filter((m) => m.contentType.startsWith("video"));
    const documentMedia = media.filter(
      (m) =>
        !m.contentType.startsWith("image") &&
        !m.contentType.startsWith("audio") &&
        !m.contentType.startsWith("video"),
    );

    if (imageMedia.length > 0) {
      groups.push({
        category: "image",
        items: imageMedia,
        icon: ImageIcon,
      });
    }
    if (audioMedia.length > 0) {
      groups.push({
        category: "audio",
        items: audioMedia,
        icon: Volume2,
      });
    }
    if (videoMedia.length > 0) {
      groups.push({
        category: "video",
        items: videoMedia,
        icon: Video,
      });
    }
    if (documentMedia.length > 0) {
      groups.push({
        category: "document",
        items: documentMedia,
        icon: File,
      });
    }

    return groups;
  }, [media]);

  if (groupedMedia.length === 0) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()} // Prevent header click
    >
      {groupedMedia.map((group) => (
        <Popover
          key={group.category}
          open={openCategory === group.category}
          onOpenChange={(open) => {
            setOpenCategory(open ? group.category : null);
            if (!open) {
              setClickedCategory(null);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              className="relative flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
              title={`${group.items.length} ${group.category} file${
                group.items.length > 1 ? "s" : ""
              }`}
              onMouseEnter={() => {
                // Clear any pending close timeout
                if (closeTimeoutRef.current) {
                  clearTimeout(closeTimeoutRef.current);
                  closeTimeoutRef.current = null;
                }
                // Always open on hover, even if something else is pinned
                setOpenCategory(group.category);
              }}
              onMouseLeave={() => {
                // Ignore mouse leave if we just clicked (prevents race condition)
                if (justClickedRef.current === group.category) {
                  return;
                }
                // Only close on mouse leave if not clicked - with delay
                if (clickedCategory !== group.category) {
                  closeTimeoutRef.current = setTimeout(() => {
                    setOpenCategory(null);
                  }, 300); // 300ms delay to allow moving mouse to popover
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                // If already pinned, unpin and close
                if (clickedCategory === group.category) {
                  setClickedCategory(null);
                  setOpenCategory(null);
                  justClickedRef.current = null;
                } else {
                  // Pin it open (first click)
                  setClickedCategory(group.category);
                  setOpenCategory(group.category);
                  justClickedRef.current = group.category;
                  // Clear the ref after a short delay
                  setTimeout(() => {
                    justClickedRef.current = null;
                  }, 200);
                }
              }}
              onClick={(e) => {
                // Prevent default click behavior
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <group.icon className="h-3.5 w-3.5" />
              {group.items.length > 1 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                  {group.items.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto max-w-md p-2"
            align="end"
            side="bottom"
            onMouseEnter={() => {
              // Clear any pending close timeout
              if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
              }
              // Keep it open when hovering over content
              if (
                clickedCategory === null ||
                clickedCategory === group.category
              ) {
                setOpenCategory(group.category);
              }
            }}
            onMouseLeave={() => {
              // Only close on mouse leave if not clicked - with delay
              if (clickedCategory !== group.category) {
                closeTimeoutRef.current = setTimeout(() => {
                  setOpenCategory(null);
                }, 300); // 300ms delay
              }
            }}
          >
            <div className="flex flex-wrap gap-2">
              {group.items.map((mediaItem) => (
                <MediaPreview key={mediaItem.mediaId} mediaItem={mediaItem} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
