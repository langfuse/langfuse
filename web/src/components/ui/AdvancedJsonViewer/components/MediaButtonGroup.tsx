import { useMemo, useState, useRef } from "react";
import { type MediaReturnType } from "@/src/features/media/validation";
import { File, Image as ImageIcon, Volume2, Video } from "lucide-react";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

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
                console.log(
                  `[${group.category}] Button mouseEnter - clickedCategory:`,
                  clickedCategory,
                );
                // Always open on hover, even if something else is pinned
                console.log(`[${group.category}] Opening on hover`);
                setOpenCategory(group.category);
              }}
              onMouseLeave={() => {
                console.log(
                  `[${group.category}] Button mouseLeave - clickedCategory:`,
                  clickedCategory,
                  "justClicked:",
                  justClickedRef.current,
                );
                // Ignore mouse leave if we just clicked (prevents race condition)
                if (justClickedRef.current === group.category) {
                  console.log(
                    `[${group.category}] Ignoring mouseLeave - just clicked`,
                  );
                  return;
                }
                // Only close on mouse leave if not clicked
                if (clickedCategory !== group.category) {
                  console.log(`[${group.category}] Closing on hover away`);
                  setOpenCategory(null);
                } else {
                  console.log(`[${group.category}] Keeping open - pinned`);
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                console.log(
                  `[${group.category}] Button pointerDown - clickedCategory:`,
                  clickedCategory,
                );
                // If already pinned, unpin and close
                if (clickedCategory === group.category) {
                  console.log(`[${group.category}] Unpinning and closing`);
                  setClickedCategory(null);
                  setOpenCategory(null);
                  justClickedRef.current = null;
                } else {
                  // Pin it open (first click)
                  console.log(`[${group.category}] Pinning open`);
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
              console.log(
                `[${group.category}] Content mouseEnter - clickedCategory:`,
                clickedCategory,
              );
              // Keep it open when hovering over content
              if (
                clickedCategory === null ||
                clickedCategory === group.category
              ) {
                console.log(`[${group.category}] Keeping content open`);
                setOpenCategory(group.category);
              }
            }}
            onMouseLeave={() => {
              console.log(
                `[${group.category}] Content mouseLeave - clickedCategory:`,
                clickedCategory,
              );
              // Only close on mouse leave if not clicked
              if (clickedCategory !== group.category) {
                console.log(
                  `[${group.category}] Closing content on hover away`,
                );
                setOpenCategory(null);
              } else {
                console.log(
                  `[${group.category}] Keeping content open - pinned`,
                );
              }
            }}
          >
            <div className="flex flex-wrap gap-2">
              {group.items.map((mediaItem) => (
                <LangfuseMediaView
                  key={mediaItem.mediaId}
                  mediaAPIReturnValue={mediaItem}
                  asFileIcon={true}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
