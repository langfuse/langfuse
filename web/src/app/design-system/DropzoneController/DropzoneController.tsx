"use client";

import { useState, type ReactNode } from "react";
import {
  useDropzone,
  type DropzoneState,
  type DropzoneOptions,
  type DropzoneRootProps,
  type DropzoneInputProps,
} from "react-dropzone";

type DropzoneControls = Pick<DropzoneState, "isDragActive" | "open"> & {
  getRootProps: (props?: DropzoneRootProps) => DropzoneRootProps;
  getInputProps: (props?: DropzoneInputProps) => DropzoneInputProps;
  openDirectory: () => void;
};

type DropzoneControllerProps = Pick<
  DropzoneOptions,
  "accept" | "maxFiles" | "minSize" | "maxSize" | "noClick" | "noKeyboard"
> & {
  isDisabled: boolean;
  onDrop: (files: File[]) => void | Promise<void>;
  onError: ((error: Error) => void) | undefined;
  onProcessingChange?: (isProcessing: boolean) => void;
  children: (controls: DropzoneControls) => ReactNode;
};

export function DropzoneController({
  isDisabled,
  onDrop,
  onError,
  onProcessingChange,
  children,
  ...options
}: DropzoneControllerProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const handleError = (error: Error) => {
    setIsDragActive(false);
    onProcessingChange?.(false);
    onError?.(error);
  };
  const zone = useDropzone({
    ...options,
    disabled: isDisabled,
    useFsAccessApi: false,
    onDragLeave: () => setIsDragActive(false),
    onError: handleError,
    onDrop: async (files, rejections) => {
      try {
        if (rejections.length) {
          throw new Error(
            rejections[0]?.errors[0]?.message ?? "Could not read files.",
          );
        }
        onProcessingChange?.(true);
        await onDrop(files);
      } catch (error) {
        onError?.(
          error instanceof Error ? error : new Error("Could not read files."),
        );
      } finally {
        onProcessingChange?.(false);
      }
    },
  });

  const openPicker = (directory: boolean) => {
    if (isDisabled) return;
    if (directory) zone.inputRef.current?.setAttribute("webkitdirectory", "");
    else zone.inputRef.current?.removeAttribute("webkitdirectory");
    zone.open();
  };

  return children({
    open: () => openPicker(false),
    openDirectory: () => openPicker(true),
    isDragActive: isDragActive && !isDisabled,
    getInputProps: (props) =>
      zone.getInputProps({
        ...props,
        onChange: (event) => {
          if (event.target.files?.length) onProcessingChange?.(true);
          props?.onChange?.(event);
        },
      }),
    getRootProps: (props) =>
      zone.getRootProps({
        ...props,
        onDragEnter: (event) => {
          if (event.dataTransfer.types.includes("Files")) setIsDragActive(true);
          props?.onDragEnter?.(event);
        },
        // Disabled dropzones must still suppress the browser's file navigation.
        onDragOverCapture: (event) => {
          if (event.dataTransfer.types.includes("Files"))
            event.preventDefault();
        },
        onDropCapture: (event) => {
          setIsDragActive(false);
          if (event.dataTransfer.types.includes("Files"))
            event.preventDefault();
        },
        onDrop: (event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes("Files"))
            onProcessingChange?.(true);
          props?.onDrop?.(event);
        },
      }),
  });
}
