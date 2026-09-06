"use client";

import { cva } from "class-variance-authority";
import { PaperclipIcon, UploadIcon } from "lucide-react";
import { useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/src/utils/tailwind";
import { useSharedUiTranslations } from "@/src/utils/shared-ui-translations";

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
  accept: Record<string, string[]> | undefined;
  isDisabled: boolean;
  minSize: number | undefined;
  onError: ((error: Error) => void) | undefined;
  src: File[] | undefined;
  maxFiles: number;
  maxSize: number | undefined;
  onDrop: (acceptedFiles: File[]) => void;
  variant: "compact" | "panel";
};

const dropzoneVariants = cva(
  "ring-offset-background focus-visible:ring-ring relative inline-flex h-auto w-full flex-col items-center justify-center overflow-hidden rounded-md text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        compact:
          "border-none bg-background p-0 text-left hover:bg-accent hover:text-accent-foreground",
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

const MAX_LABEL_ITEMS = 3;

export const Dropzone = ({
  accept,
  maxFiles,
  maxSize,
  minSize,
  onDrop,
  onError,
  isDisabled,
  src,
  variant,
}: DropzoneProps) => {
  const t = useSharedUiTranslations("dropzone");
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles,
    maxSize,
    minSize,
    onError,
    disabled: isDisabled,
    onDrop: (acceptedFiles, fileRejections) => {
      if (fileRejections.length > 0) {
        const message = fileRejections.at(0)?.errors.at(0)?.message;
        onError?.(new Error(message));
        return;
      }

      onDrop(acceptedFiles);
    },
  });

  const contentText = useMemo(() => {
    if (variant === "compact") {
      if (!src?.length) {
        return t("attachFiles");
      }

      return t("fileCount", {
        count: src.length,
        size: (
          src.reduce((total, file) => total + file.size, 0) /
          (1024 * 1024)
        ).toFixed(2),
      });
    }

    if (!src) {
      return "";
    }

    if (src.length > MAX_LABEL_ITEMS) {
      return t("andMore", {
        files: new Intl.ListFormat("en").format(
          src.slice(0, MAX_LABEL_ITEMS).map((file) => file.name),
        ),
        count: src.length - MAX_LABEL_ITEMS,
      });
    }

    return new Intl.ListFormat("en").format(src.map((file) => file.name));
  }, [src, t, variant]);

  const caption = useMemo(() => {
    const acceptedTypes = accept
      ? t("accepts", {
          types: new Intl.ListFormat("en").format(Object.keys(accept)),
        })
      : "";

    if (minSize && maxSize) {
      return t("between", {
        acceptedTypes,
        min: renderBytes(minSize),
        max: renderBytes(maxSize),
      });
    }

    if (minSize) {
      return t("atLeast", {
        acceptedTypes,
        min: renderBytes(minSize),
      });
    }

    if (maxSize) {
      return t("lessThan", {
        acceptedTypes,
        max: renderBytes(maxSize),
      });
    }

    return acceptedTypes;
  }, [accept, maxSize, minSize, t]);

  const emptyStateTitle = t("upload", { count: maxFiles });
  const emptyStateDescription = t("uploadDescription");
  const panelTitle = src?.length ? contentText : emptyStateTitle;
  const panelDescription = src?.length
    ? t("replaceDescription")
    : emptyStateDescription;

  return (
    <button
      key={JSON.stringify(src)}
      className={dropzoneVariants({ isDragActive, variant })}
      disabled={isDisabled}
      type="button"
      {...getRootProps()}
    >
      <input {...getInputProps()} disabled={isDisabled} />
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
              !src?.length && "text-wrap",
            )}
            title={panelTitle}
          >
            {panelTitle}
          </p>
          <p
            className={cn(
              "text-muted-foreground w-full text-xs text-wrap",
              !src?.length && "truncate",
            )}
            title={src?.length ? undefined : panelDescription}
          >
            {panelDescription}
          </p>
          {!src?.length && caption && (
            <p className="text-muted-foreground text-xs text-wrap">
              {caption}.
            </p>
          )}
        </div>
      )}
    </button>
  );
};
