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

const MEDIA_TYPE_ICON: Record<string, LucideIcon> = {
  image: ImageIcon,
  audio: Volume2,
  video: Video,
};

const OFFICE_CONTENT_TYPE_LABEL: Record<string, string> = {
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

export function MediaFileCard({
  contentType,
  fileName,
  onClick,
}: MediaFileCardProps) {
  const mediaType = contentType.split("/")[0] ?? "";
  const MediaIcon = MEDIA_TYPE_ICON[mediaType];
  const Icon = MediaIcon ?? File;
  const isPreviewable = MediaIcon !== undefined;
  const officeFileLabel = OFFICE_CONTENT_TYPE_LABEL[contentType.toLowerCase()];
  const fileLabel =
    officeFileLabel ?? contentType.split("/")[1]?.toUpperCase() ?? "FILE";

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
      <div className="flex w-full min-w-0 flex-col items-center gap-1">
        <span
          className={
            officeFileLabel
              ? "shrink-0 text-sm font-bold whitespace-nowrap"
              : "w-full truncate text-sm font-bold"
          }
          title={contentType}
        >
          {fileLabel}
        </span>
        <span
          className="text-muted-foreground w-full truncate text-xs"
          title={fileName}
        >
          {fileName}
        </span>
      </div>
    </button>
  );
}
