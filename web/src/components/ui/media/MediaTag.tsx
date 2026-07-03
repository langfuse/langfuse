import * as React from "react";
import {
  ExternalLink,
  File,
  Image as ImageIcon,
  ImageOff,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

/**
 * Resolution state of the previewable content. The collapsed chip renders the
 * same regardless of status (it only needs `contentType`); status drives the
 * peek popover body. Owned by the container that fetches the URL — `MediaTag`
 * itself never fetches, which keeps it pure and Storybook-able.
 */
export type MediaTagStatus = "idle" | "loading" | "ready" | "error";

export interface MediaTagProps {
  /**
   * Full MIME type from the media reference (e.g. "image/png"). Known before
   * any fetch, so the chip + icon + label always render without a URL.
   */
  contentType: string;
  /** Peek-content resolution state. Defaults to "idle". */
  status?: MediaTagStatus;
  /**
   * Resolved URL for the preview and the "open in new tab" action. Only
   * meaningful when `status === "ready"`.
   */
  url?: string;
  /** Overrides the chip label (defaults to the MIME subtype, e.g. "JPEG"). */
  label?: string;
  /** Controlled open state of the peek popover (used by stories/tests). */
  open?: boolean;
  /**
   * Fired when the popover opens/closes. The container arms its lazy fetch on
   * the `true` transition (VSCode-peek semantics: pull content on hover).
   */
  onOpenChange?: (open: boolean) => void;
}

type MediaKind = "image" | "audio" | "video" | "file";

function getMediaKind(contentType: string): MediaKind {
  const top = contentType.split("/")[0]?.toLowerCase();
  if (top === "image") return "image";
  if (top === "audio") return "audio";
  if (top === "video") return "video";
  return "file";
}

/** "image/svg+xml" -> "SVG", "application/pdf" -> "PDF". */
function getDefaultLabel(contentType: string): string {
  const subtype = contentType.split("/")[1]?.split("+")[0];
  return (subtype || "file").toUpperCase();
}

const MEDIA_KIND_ICON = {
  image: ImageIcon,
  audio: Volume2,
  video: Video,
  file: File,
} satisfies Record<MediaKind, LucideIcon>;

function KindIcon({
  kind,
  className,
}: {
  kind: MediaKind;
  className?: string;
}) {
  const Icon = MEDIA_KIND_ICON[kind];
  return <Icon className={className} />;
}

type PreviewRenderer = (params: {
  url: string;
  onError: () => void;
}) => React.ReactNode;

const MEDIA_KIND_PREVIEW = {
  image: ({ url, onError }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={onError}
      // Bounded by the max-h cap and the card's max-w-sm; object-contain
      // keeps high-resolution images from blowing out the popover.
      className="max-h-64 max-w-full rounded object-contain"
    />
  ),
  video: ({ url, onError }) => (
    <video
      src={url}
      onError={onError}
      className="max-h-64 max-w-full rounded"
      controls
      muted
      playsInline
      preload="metadata"
    />
  ),
  audio: ({ url, onError }) => (
    <audio
      src={url}
      onError={onError}
      controls
      className="w-64"
      preload="metadata"
    />
  ),
  file: () => (
    <div className="text-muted-foreground flex h-24 w-64 flex-col items-center justify-center gap-2">
      <File className="h-5 w-5" />
      <span className="text-xs">No inline preview</span>
    </div>
  ),
} satisfies Record<MediaKind, PreviewRenderer>;

/** The peek body — a glance, not a full player. Images/video show a thumbnail;
 *  audio gets an inline player; other types are open-in-new-tab only. */
function PeekBody({
  kind,
  status,
  url,
  onPreviewError,
}: {
  kind: MediaKind;
  status: MediaTagStatus;
  url?: string;
  onPreviewError: () => void;
}) {
  if (status === "error") {
    return (
      <div className="text-muted-foreground flex h-24 w-64 flex-col items-center justify-center gap-2">
        <ImageOff className="h-5 w-5" />
        <span className="text-xs">Failed to load media</span>
      </div>
    );
  }

  if (status !== "ready" || !url) {
    return <Skeleton className="h-32 w-64" />;
  }

  return MEDIA_KIND_PREVIEW[kind]({ url, onError: onPreviewError });
}

/**
 * Pure, presentational media tag for use inside JSON viewers. Renders a compact
 * inline chip (icon + MIME label) that, on hover/focus, opens a read-only peek
 * popover with a preview and an "open in new tab" action.
 *
 * It receives the resolved `url` + `status` as props and never fetches — the
 * owning container (`JsonMediaTag`) gates a lazy fetch on `onOpenChange`.
 */
export const MediaTag = React.forwardRef<HTMLButtonElement, MediaTagProps>(
  ({ contentType, status = "idle", url, label, open, onOpenChange }, ref) => {
    const kind = getMediaKind(contentType);
    const chipLabel = label ?? getDefaultLabel(contentType);
    const canOpen = status === "ready" && Boolean(url);
    const [failedPreviewUrl, setFailedPreviewUrl] = React.useState<
      string | null
    >(null);
    const previewStatus =
      status === "ready" && url && failedPreviewUrl === url ? "error" : status;
    const isControlled = open !== undefined;
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
    const isOpen = isControlled ? open : uncontrolledOpen;

    const setOpen = React.useCallback(
      (nextOpen: boolean) => {
        if (!isControlled) setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen);
      },
      [isControlled, onOpenChange],
    );

    const openPeek = React.useCallback(() => setOpen(true), [setOpen]);

    return (
      <HoverCard open={isOpen} onOpenChange={setOpen}>
        <HoverCardTrigger asChild>
          <button
            ref={ref}
            type="button"
            // Marker for containers to detect chip hover via event delegation
            // (`closest("[data-media-tag]")`): IOTableCell suppresses its
            // expand-on-hover card and native title while over a chip.
            data-media-tag=""
            aria-label={`${chipLabel} media`}
            aria-expanded={isOpen}
            className="hover:bg-accent focus-visible:ring-ring bg-background inline-flex h-3.5 max-w-full items-center gap-1 rounded-sm border px-1 py-0 align-middle text-xs leading-none transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
            onClick={openPeek}
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") {
                event.preventDefault();
                openPeek();
              }
            }}
          >
            <KindIcon kind={kind} className="h-2.5 w-2.5 shrink-0" />
            <span
              className="relative top-0.25 truncate align-baseline font-mono leading-none"
              // Empty while the peek is open: a native tooltip would render on
              // top of the peek. Ancestors with a title still tooltip over the
              // peek — containers must suppress theirs too (see IOTableCell).
              title={isOpen ? "" : chipLabel}
            >
              {chipLabel}
            </span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="flex w-auto max-w-sm flex-col gap-2 p-2"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
              <KindIcon kind={kind} className="h-3.5 w-3.5 shrink-0" />
              <span
                className="truncate font-mono leading-none"
                title={contentType}
              >
                {contentType}
              </span>
            </div>
            {canOpen ? (
              <Button
                asChild
                variant="outline"
                size="icon-xs"
                title="Open in new tab"
              >
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon-xs"
                disabled
                title="Open in new tab"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
          <PeekBody
            kind={kind}
            status={previewStatus}
            url={url}
            onPreviewError={() => setFailedPreviewUrl(url ?? null)}
          />
        </HoverCardContent>
      </HoverCard>
    );
  },
);

MediaTag.displayName = "MediaTag";
