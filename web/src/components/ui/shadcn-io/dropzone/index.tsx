"use client";

import { PaperclipIcon, UploadIcon } from "lucide-react";
import type { DropEvent, DropzoneOptions, FileRejection } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { cn } from "@/src/utils/tailwind";

const renderBytes = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)}${units[unitIndex]}`;
};

export type DropzoneProps = Pick<
  DropzoneOptions,
  "accept" | "disabled" | "minSize" | "onError"
> & {
  src?: File[];
  maxFiles: NonNullable<DropzoneOptions["maxFiles"]>;
  maxSize: NonNullable<DropzoneOptions["maxSize"]>;
  onDrop: (
    acceptedFiles: File[],
    fileRejections: FileRejection[],
    event: DropEvent,
  ) => void;
  variant: "compact" | "panel";
};

const variantClasses = {
  compact:
    "border-border-contrast border border-none bg-background p-0 text-left hover:bg-accent hover:text-accent-foreground",
  panel:
    "border-border-contrast bg-secondary/50 border border-dashed p-8 hover:bg-accent hover:text-accent-foreground",
} as const;

export const Dropzone = ({
  accept,
  maxFiles,
  maxSize,
  minSize,
  onDrop,
  onError,
  disabled,
  src,
  variant,
  ...props
}: DropzoneProps) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles,
    maxSize,
    minSize,
    onError,
    disabled,
    onDrop: (acceptedFiles, fileRejections, event) => {
      if (fileRejections.length > 0) {
        const message = fileRejections.at(0)?.errors.at(0)?.message;
        onError?.(new Error(message));
        return;
      }

      onDrop?.(acceptedFiles, fileRejections, event);
    },
    ...props,
  });

  return (
    <button
      key={JSON.stringify(src)}
      className={cn(
        "ring-offset-background focus-visible:ring-ring relative inline-flex h-auto w-full flex-col items-center justify-center overflow-hidden rounded-md text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        isDragActive && "ring-ring ring-1 outline-hidden",
      )}
      disabled={disabled}
      type="button"
      {...getRootProps()}
    >
      <input {...getInputProps()} disabled={disabled} />
      {variant === "compact" ? (
        <DropzoneCompactContent src={src} />
      ) : src ? (
        <DropzoneContent src={src} />
      ) : (
        <DropzoneEmptyState
          accept={accept}
          maxFiles={maxFiles}
          maxSize={maxSize}
          minSize={minSize}
        />
      )}
    </button>
  );
};

const maxLabelItems = 3;

const DropzoneCompactContent = ({ src }: { src?: File[] }) => {
  const text = src?.length
    ? `${src.length} file${src.length > 1 ? "s" : ""} • ${(
        src.reduce((total, file) => total + file.size, 0) /
        (1024 * 1024)
      ).toFixed(2)} MB`
    : "Attach files";

  return (
    <div className="flex w-full cursor-pointer items-center justify-start gap-2 p-2 text-xs">
      <PaperclipIcon className="h-4 w-4" />
      <span className="truncate" title={text}>
        {text}
      </span>
    </div>
  );
};

const DropzoneContent = ({ src }: { src: File[] }) => {
  const text =
    src.length > maxLabelItems
      ? `${new Intl.ListFormat("en").format(
          src.slice(0, maxLabelItems).map((file) => file.name),
        )} and ${src.length - maxLabelItems} more`
      : new Intl.ListFormat("en").format(src.map((file) => file.name));

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
        <UploadIcon size={16} />
      </div>
      <p className="my-2 w-full truncate text-sm font-bold" title={text}>
        {text}
      </p>
      <p className="text-muted-foreground w-full text-xs text-wrap">
        Drag and drop or click to replace
      </p>
    </div>
  );
};

const DropzoneEmptyState = ({
  accept,
  maxFiles,
  maxSize,
  minSize,
}: {
  accept?: DropzoneOptions["accept"];
  maxFiles: NonNullable<DropzoneOptions["maxFiles"]>;
  maxSize: NonNullable<DropzoneOptions["maxSize"]>;
  minSize?: DropzoneOptions["minSize"];
}) => {
  let caption = "";

  if (accept) {
    caption += "Accepts ";
    caption += new Intl.ListFormat("en").format(Object.keys(accept));
  }

  if (minSize && maxSize) {
    caption += ` between ${renderBytes(minSize)} and ${renderBytes(maxSize)}`;
  } else if (minSize) {
    caption += ` at least ${renderBytes(minSize)}`;
  } else if (maxSize) {
    caption += ` less than ${renderBytes(maxSize)}`;
  }

  const text1 = `Upload ${maxFiles === 1 ? "a file" : "files"}`;
  const text2 = "Drag and drop or click to upload";

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
        <UploadIcon size={16} />
      </div>
      <p
        className="my-2 w-full truncate text-sm font-bold text-wrap"
        title={text1}
      >
        {text1}
      </p>
      <p
        className="text-muted-foreground w-full truncate text-xs text-wrap"
        title={text2}
      >
        {text2}
      </p>
      {caption && (
        <p className="text-muted-foreground text-xs text-wrap">{caption}.</p>
      )}
    </div>
  );
};
