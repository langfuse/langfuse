"use client";

import { Image as ImageIcon, ImageOff, Info, Loader2 } from "@langfuse/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { type StaticImageData } from "next/image";
import { assertUnreachable } from "@langfuse/shared";
import {
  SafeImageController,
  type ImageProps,
  type SafeImageState,
} from "@/src/components/design-system/SafeImageController/SafeImageController";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../Button/Button";
import { FloatingController } from "../FloatingController/FloatingController";
import styles from "./SafeImage.module.css";

type SafeImageProps = Pick<
  ImageProps,
  "alt" | "className" | "width" | "height" | "loading" | "title" | "onError"
> &
  (
    | { state: SafeImageState; src?: never }
    | { src: StaticImageData; state?: never }
  );

/** Pass imported application assets directly; arbitrary content requires connected state. */
export function SafeImage({
  src,
  state,
  width,
  height,
  // oxlint-disable-next-line @repo/no-style-props -- Image callers own the shared box dimensions across all states.
  className,
  ...props
}: SafeImageProps) {
  const placeholderRef = useRef<HTMLSpanElement>(null);
  const sourceRef = useRef<HTMLSpanElement>(null);
  const [isSourceTruncated, setIsSourceTruncated] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const placeholderSrc =
    state?.status === "consent" || state?.status === "error" ? state.src : null;

  useLayoutEffect(() => {
    const placeholder = placeholderRef.current;
    const source = sourceRef.current;
    if (!placeholder || !source || placeholderSrc === null) return;

    const measureSource = () => {
      // Keep measuring outside the inline details so a popover can revert after a resize.
      setIsSourceTruncated(
        source.getBoundingClientRect().width > placeholder.clientWidth - 16,
      );
    };
    measureSource();
    const observer = new ResizeObserver(measureSource);
    observer.observe(placeholder);
    observer.observe(source);
    return () => observer.disconnect();
  }, [placeholderSrc]);

  if (state === undefined) {
    return (
      <SafeImageController src={src.src}>
        {(state) => (
          <SafeImage
            {...props}
            state={state}
            width={width}
            height={height}
            className={className}
          />
        )}
      </SafeImageController>
    );
  }

  if (state.status === "ready") {
    const { Image, imageProps } = state;
    return (
      <Image
        {...props}
        {...imageProps}
        width={width}
        height={height}
        className={cn("block", className)}
        alt={props.alt}
      />
    );
  }

  return (
    <span
      ref={placeholderRef}
      data-source-truncated={isSourceTruncated || undefined}
      className={cn(
        "inline-block",
        styles.placeholder,
        "relative h-40 w-60 overflow-hidden align-middle",
        className,
      )}
      style={{ width, height }}
    >
      {placeholderSrc !== null ? (
        <span
          ref={sourceRef}
          aria-hidden="true"
          data-source={placeholderSrc}
          className={cn(
            styles.sourceMeasurement,
            "pointer-events-none invisible absolute w-max max-w-none text-xs whitespace-nowrap",
          )}
        />
      ) : null}
      {(() => {
        if (state.status === "loading") {
          return (
            <span
              role="status"
              aria-label="Loading image"
              className="text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 text-xs"
            >
              <span className="shrink-0 animate-spin">
                <Loader2 size="base" />
              </span>
              <span className={styles.loadingText} aria-hidden="true">
                Loading image...
              </span>
            </span>
          );
        }
        if (state.status === "consent" || state.status === "error") {
          const Icon = state.status === "consent" ? ImageIcon : ImageOff;
          const label =
            state.status === "consent"
              ? "Load image details"
              : "Image error details";
          const details = (
            <span className="flex w-full min-w-0 flex-col items-center gap-2 text-center text-xs">
              {state.status === "consent" ? (
                <Button
                  text="Load Image"
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={state.onLoad}
                />
              ) : (
                <span
                  className={cn(styles.message, "max-w-full")}
                  title={state.message}
                >
                  {state.message}
                </span>
              )}
              {state.status === "consent" ? (
                <a
                  href={state.src}
                  title={state.src}
                  className="max-w-full truncate underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {state.src}
                </a>
              ) : (
                <span className="max-w-full truncate" title={state.src}>
                  {state.src}
                </span>
              )}
            </span>
          );
          return (
            <span className="text-muted-foreground flex h-full w-full flex-col items-center justify-center">
              <span
                className={cn(
                  styles.inlineDetails,
                  "w-full flex-col items-center gap-2 p-2",
                )}
              >
                <Icon size="base" />
                {details}
              </span>
              <span className={cn(styles.compactDetails, "h-full w-full")}>
                <FloatingController
                  open={isDetailsOpen}
                  onOpenChange={setIsDetailsOpen}
                  interaction="hover"
                  aria-label={label}
                  renderContent={(floatingProps) => (
                    <div
                      {...floatingProps}
                      className="bg-popover text-popover-foreground flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-md border p-4 text-sm shadow-md"
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <Icon size="base" />
                        <span>
                          {state.status === "consent"
                            ? "Image hidden"
                            : "Image unavailable"}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {state.status === "consent"
                          ? "Loading this image contacts its source server. Load it only if you trust the source."
                          : state.message}
                      </p>
                      {state.status === "error" &&
                      state.message === "Cannot load image" ? (
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          The source may be unavailable, or the image may have
                          been blocked for security reasons.
                        </p>
                      ) : null}
                      <div className="flex min-w-0 flex-col gap-1 text-xs">
                        <span className="text-muted-foreground font-medium">
                          Image source
                        </span>
                        <div className="bg-muted/50 max-h-24 overflow-y-auto rounded-md border p-2 font-mono break-all">
                          {state.status === "consent" ? (
                            <a
                              href={state.src}
                              className="underline underline-offset-2"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {state.src}
                            </a>
                          ) : (
                            <span>{state.src}</span>
                          )}
                        </div>
                      </div>
                      {state.status === "consent" ? (
                        <Button
                          text="Load Image"
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={state.onLoad}
                        />
                      ) : null}
                    </div>
                  )}
                >
                  {({ getTriggerProps }) => (
                    <button
                      {...getTriggerProps({
                        onClick: (event) => {
                          event.stopPropagation();
                          setIsDetailsOpen(true);
                        },
                      })}
                      type="button"
                      aria-label={label}
                      title="Show image info"
                      className="hover:bg-accent focus-visible:ring-ring flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <span className="relative">
                        <Icon size="base" />
                        <span className="bg-background absolute -top-1.5 -right-1.5 rounded-full">
                          <Info size="sm" />
                        </span>
                      </span>
                      <span
                        className={cn(
                          styles.detailsHint,
                          "text-xs underline underline-offset-2",
                        )}
                      >
                        Show image info
                      </span>
                    </button>
                  )}
                </FloatingController>
              </span>
            </span>
          );
        }
        return assertUnreachable(state);
      })()}
    </span>
  );
}
