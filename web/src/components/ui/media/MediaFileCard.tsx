import {
  File,
  Image as ImageIcon,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";

export type MediaFileCardProps = {
  contentType: string;
  fileName: string;
  onClick: () => void;
};

const MEDIA_TYPE_ICON = {
  image: ImageIcon,
  audio: Volume2,
  video: Video,
} satisfies Record<string, LucideIcon>;

export function MediaFileCard({
  contentType,
  fileName,
  onClick,
}: MediaFileCardProps) {
  const mediaType = contentType.split("/")[0] ?? "";
  const Icon = MEDIA_TYPE_ICON[mediaType] ?? File;
  const isPreviewable = mediaType in MEDIA_TYPE_ICON;
  const fileExtension = contentType.split("/")[1]?.toUpperCase() || "FILE";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        isPreviewable
          ? `Show ${fileName} inline`
          : `Open ${fileName} in new tab`
      }
      aria-expanded={isPreviewable ? false : undefined}
      title={fileName}
      className="from-accent-light-green/30 to-muted hover:from-accent-light-green/40 hover:to-muted/90 dark:from-accent-dark-green/20 dark:to-muted dark:hover:from-accent-dark-green/30 group relative flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-md border bg-linear-to-br px-2 transition-colors"
    >
      <Icon className="h-5 w-5 transition-transform group-hover:scale-110" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-bold">{fileExtension}</span>
        <span className="text-muted-foreground text-xs">
          {fileName.length > 5 ? `${fileName.slice(0, 5)}...` : fileName}
        </span>
      </div>
    </button>
  );
}
