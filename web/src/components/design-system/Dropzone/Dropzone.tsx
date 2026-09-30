"use client";

import { cva } from "class-variance-authority";
import { PaperclipIcon, UploadIcon } from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";
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
  accept: Record<string, string[]> | undefined;
  isDisabled: boolean;
  minSize: number | undefined;
  onError: ((error: Error) => void) | undefined;
  src: File[] | undefined;
  maxFiles: number;
  maxSize: number | undefined;
  onDrop: (acceptedFiles: File[]) => void | Promise<void>;
  variant: "compact" | "panel";
  onProcessingChange?: (isProcessing: boolean) => void;
} & (
  | {
      children?: never;
      open?: never;
      onOpenChange?: never;
      header?: never;
      onKeyDownCapture?: never;
    }
  | {
      children: ReactNode;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      header?: ReactNode;
      onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>;
    }
);

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

export const Dropzone = (props: DropzoneProps) => {
  const { src, variant, accept, maxFiles, maxSize, minSize, open } = props;
  const hasChildren = props.children !== undefined;
  const [isProcessing, setIsProcessing] = useState(false);
  const isDisabled = props.isDisabled || (hasChildren && isProcessing);
  const dragWasOpen = useRef<boolean | null>(null);
  const uploadButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const focusUploadButton = useCallback((node: HTMLButtonElement | null) => {
    uploadButtonRef.current = node;
    if (!node) return;
    node.focus();
    return () => {
      uploadButtonRef.current = null;
      requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, []);

  const [isDragActive, setIsDragActive] = useState(false);
  const updateDragActive = (active: boolean) => {
    setIsDragActive(active);
    if (active) {
      if (dragWasOpen.current === null) {
        dragWasOpen.current = open ?? false;
        props.onOpenChange?.(true);
      }
    } else {
      if (dragWasOpen.current === false) props.onOpenChange?.(false);
      dragWasOpen.current = null;
    }
  };
  const updateProcessing = (processing: boolean) => {
    if (processing) {
      // Keep the surface mounted while drop events finish bubbling and files load.
      if (dragWasOpen.current !== null) dragWasOpen.current = true;
      props.onOpenChange?.(true);
    }
    setIsProcessing(processing);
    props.onProcessingChange?.(processing);
    if (!processing) {
      dragWasOpen.current = null;
      requestAnimationFrame(() => uploadButtonRef.current?.focus());
    }
  };
  const zone = useDropzone({
    accept,
    maxFiles,
    maxSize,
    minSize,
    noClick: hasChildren,
    noKeyboard: hasChildren,
    disabled: isDisabled,
    useFsAccessApi: false,
    onDragLeave: () => updateDragActive(false),
    onError: (error) => {
      updateDragActive(false);
      updateProcessing(false);
      props.onError?.(error);
    },
    onDrop: async (files, rejections) => {
      try {
        if (rejections.length) {
          throw new Error(
            rejections[0]?.errors[0]?.message ?? "Could not read files.",
          );
        }
        updateProcessing(true);
        await props.onDrop(files);
      } catch (error) {
        props.onError?.(
          error instanceof Error ? error : new Error("Could not read files."),
        );
      } finally {
        updateProcessing(false);
      }
    },
  });
  const rootProps = zone.getRootProps({
    onDragEnter: (event) => {
      if (event.dataTransfer.types.includes("Files")) updateDragActive(true);
    },
    // Disabled dropzones must still suppress the browser's file navigation.
    onDragOverCapture: (event) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault();
    },
    onDropCapture: (event) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault();
    },
    onDrop: (event) => {
      event.preventDefault();
      if (event.dataTransfer.types.includes("Files")) updateProcessing(true);
      updateDragActive(false);
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

    if (src.length > MAX_LABEL_ITEMS) {
      return `${new Intl.ListFormat("en").format(
        src.slice(0, MAX_LABEL_ITEMS).map((file) => file.name),
      )} and ${src.length - MAX_LABEL_ITEMS} more`;
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
  const panelTitle = src?.length ? contentText : emptyStateTitle;
  const panelDescription = src?.length
    ? "Drag and drop or click to replace"
    : emptyStateDescription;

  const uploadTarget = (
    <button
      key={JSON.stringify(src)}
      className={dropzoneVariants({
        isDragActive: isDragActive && !isDisabled,
        variant,
      })}
      disabled={isDisabled}
      ref={hasChildren ? focusUploadButton : undefined}
      type="button"
      onClick={
        hasChildren
          ? (event) => {
              event.stopPropagation();
              if (!isDisabled) zone.open();
            }
          : undefined
      }
      {...(hasChildren ? {} : rootProps)}
    >
      <input
        {...zone.getInputProps({
          onChange: (event) => {
            if (event.target.files?.length) updateProcessing(true);
          },
        })}
        disabled={isDisabled}
      />
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
  return hasChildren ? (
    <div
      {...rootProps}
      role="region"
      aria-label="File upload area"
      className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1"
      onKeyDownCapture={props.onKeyDownCapture}
      onFocusCapture={(event) => {
        if (!open) returnFocusRef.current = event.target;
      }}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col [grid-area:1/1]",
          open && "invisible",
        )}
        inert={open}
        aria-hidden={open}
      >
        {props.children}
      </div>
      {open ? (
        <section
          aria-label="Upload files"
          className="bg-background flex min-h-0 flex-col gap-3 p-4 [grid-area:1/1]"
          aria-busy={isProcessing}
        >
          {props.header}
          <div className="flex min-h-0 flex-1">{uploadTarget}</div>
        </section>
      ) : null}
    </div>
  ) : (
    uploadTarget
  );
};
