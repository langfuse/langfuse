"use client";

import { cva } from "class-variance-authority";
import { PaperclipIcon, UploadIcon } from "lucide-react";
import { useMemo } from "react";
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

export type DropzoneProps = {
  accept?: DropzoneOptions["accept"];
  disabled?: DropzoneOptions["disabled"];
  minSize?: DropzoneOptions["minSize"];
  onError?: DropzoneOptions["onError"];
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

const dropzoneVariants = cva(
  "ring-offset-background focus-visible:ring-ring relative inline-flex h-auto w-full flex-col items-center justify-center overflow-hidden rounded-md text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        compact:
          "border-border-contrast border border-none bg-background p-0 text-left hover:bg-accent hover:text-accent-foreground",
        panel:
          "border-border-contrast bg-secondary/50 border border-dashed p-8 hover:bg-accent hover:text-accent-foreground",
      },
      isDragActive: {
        true: "ring-ring ring-1 outline-hidden",
        false: null,
      },
    },
  },
);

const maxLabelItems = 3;

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
  });

  const contentText = useMemo(() => {
    if (variant === "compact") {
      if (!src?.length) {
        return "Attach files";
      }

      return `${src.length} file${src.length > 1 ? "s" : ""} • ${(
        src.reduce((total, file) => total + file.size, 0) /
        (1024 * 1024)
      ).toFixed(2)} MB`;
    }

    if (!src) {
      return "";
    }

    if (src.length > maxLabelItems) {
      return `${new Intl.ListFormat("en").format(
        src.slice(0, maxLabelItems).map((file) => file.name),
      )} and ${src.length - maxLabelItems} more`;
    }

    return new Intl.ListFormat("en").format(src.map((file) => file.name));
  }, [src, variant]);

  const caption = useMemo(() => {
    const acceptedTypes = accept
      ? `Accepts ${new Intl.ListFormat("en").format(Object.keys(accept))}`
      : "";

    if (minSize && maxSize) {
      return `${acceptedTypes} between ${renderBytes(minSize)} and ${renderBytes(maxSize)}`;
    }

    if (minSize) {
      return `${acceptedTypes} at least ${renderBytes(minSize)}`;
    }

    if (maxSize) {
      return `${acceptedTypes} less than ${renderBytes(maxSize)}`;
    }

    return acceptedTypes;
  }, [accept, maxSize, minSize]);

  const emptyStateTitle = `Upload ${maxFiles === 1 ? "a file" : "files"}`;
  const emptyStateDescription = "Drag and drop or click to upload";
  const panelTitle = src ? contentText : emptyStateTitle;
  const panelDescription = src
    ? "Drag and drop or click to replace"
    : emptyStateDescription;

  return (
    <button
      key={JSON.stringify(src)}
      className={dropzoneVariants({ isDragActive, variant })}
      disabled={disabled}
      type="button"
      {...getRootProps()}
    >
      <input {...getInputProps()} disabled={disabled} />
      {variant === "compact" && (
        <div className="flex w-full cursor-pointer items-center justify-start gap-2 p-2 text-xs">
          <PaperclipIcon className="h-4 w-4" />
          <span className="truncate" title={contentText}>
            {contentText}
          </span>
        </div>
      )}
      {variant === "panel" && (
        <div className="flex flex-col items-center justify-center">
          <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
            <UploadIcon size={16} />
          </div>
          <p
            className={cn(
              "my-2 w-full truncate text-sm font-bold",
              !src && "text-wrap",
            )}
            title={panelTitle}
          >
            {panelTitle}
          </p>
          <p
            className={cn(
              "text-muted-foreground w-full text-xs text-wrap",
              !src && "truncate",
            )}
            title={src ? undefined : panelDescription}
          >
            {panelDescription}
          </p>
          {!src && caption && (
            <p className="text-muted-foreground text-xs text-wrap">
              {caption}.
            </p>
          )}
        </div>
      )}
    </button>
  );
};
