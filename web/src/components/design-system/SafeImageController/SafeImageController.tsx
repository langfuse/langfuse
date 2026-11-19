"use client";

import {
  useState,
  type ComponentProps,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { getSafeImageUrl } from "@/src/utils/safe-url";

function Image({
  src,
  alt,
  onLoadError,
  onError,
  ...props
}: Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  "className" | "width" | "height" | "loading" | "title" | "onError"
> & {
  src: string;
  alt: string;
  onLoadError?: () => void;
}) {
  return (
    <img
      {...props}
      src={src}
      alt={alt}
      onError={(event) => {
        onLoadError?.();
        onError?.(event);
      }}
    />
  );
}

export type ImageProps = ComponentProps<typeof Image>;

export type SafeImageState =
  | { status: "error"; src: string; message: string }
  | { status: "consent"; src: string; onLoad: () => void }
  | { status: "loading" }
  | {
      status: "ready";
      Image: typeof Image;
      imageProps: Pick<ComponentProps<typeof Image>, "src" | "onLoadError">;
    };

export function SafeImageController({
  src,
  isDefaultVisible = true,
  children,
}: {
  /** Application-controlled or authenticated media source, not an arbitrary URL. */
  src: string;
  isDefaultVisible?: boolean;
  children: (state: SafeImageState) => ReactNode;
}) {
  const [imageState, setImageState] = useState({
    src,
    isVisible: isDefaultVisible,
    hasError: false,
  });
  const currentState =
    imageState.src === src
      ? imageState
      : { src, isVisible: isDefaultVisible, hasError: false };
  if (imageState !== currentState) {
    // Reset during render so a replacement URL never inherits consent or errors.
    setImageState(currentState);
  }
  const safeSrc = getSafeImageUrl(src, { allowInlineMedia: true });
  if (!safeSrc) {
    return children({ status: "error", src, message: "Cannot load image" });
  }

  if (currentState.hasError) {
    return children({ status: "error", src, message: "Cannot load image" });
  }
  if (!currentState.isVisible) {
    return children({
      status: "consent",
      src: safeSrc,
      onLoad: () => setImageState({ src, isVisible: true, hasError: false }),
    });
  }
  return children({
    status: "ready",
    Image,
    imageProps: {
      src: safeSrc,
      onLoadError: () =>
        setImageState({ src, isVisible: true, hasError: true }),
    },
  });
}
