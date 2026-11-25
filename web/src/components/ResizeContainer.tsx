"use client";
// Headless box: the caller owns the classes on the measured element.
/* eslint-disable @repo/no-style-props */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "@/src/utils/tailwind";

const CONTENT_SCALE_VAR = "--lf-content-scale";
const SCALED_HEIGHT_VAR = "--lf-scaled-height";

const containerStyle = {
  height: `var(${SCALED_HEIGHT_VAR}, auto)`,
} as const;

const scaledContentStyle = {
  transformOrigin: "top left",
  transform: `scale(var(${CONTENT_SCALE_VAR}, 1))`,
} as const;

/**
 * Measure a box and keep its child layout at the last committed width while
 * the box is still changing. Until the width has been still for `settleMs`,
 * a CSS scale fills the live box without a React update.
 */
function useScaledElementWidth(settleMs: number) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer((current) => (current === node ? current : node));
  }, []);
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    setContent((current) => (current === node ? current : node));
  }, []);

  useEffect(() => {
    if (!container || !content) return;

    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let committedWidth = 0;
    let lastObservedWidth = -1;

    const measure = () => Math.round(container.clientWidth);

    const clearScale = () => {
      container.style.removeProperty(CONTENT_SCALE_VAR);
      container.style.removeProperty(SCALED_HEIGHT_VAR);
      container.style.overflow = "";
    };

    const paintScale = () => {
      frame = 0;
      const live = measure();
      if (committedWidth <= 0 || live <= 0) return;
      const scale = live / committedWidth;
      if (Math.abs(scale - 1) < 0.001) {
        clearScale();
        return;
      }
      container.style.setProperty(CONTENT_SCALE_VAR, String(scale));
      container.style.setProperty(
        SCALED_HEIGHT_VAR,
        `${Math.round(content.scrollHeight * scale)}px`,
      );
      container.style.overflow = "hidden";
    };

    const publish = (next: number) => {
      committedWidth = next;
      lastObservedWidth = next;
      setWidth((current) => (current === next ? current : next));
    };

    const schedule = () => {
      const live = measure();
      if (live === lastObservedWidth) return;
      lastObservedWidth = live;
      if (frame === 0) frame = requestAnimationFrame(paintScale);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (frame !== 0) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        const settled = measure();
        if (settled !== committedWidth) publish(settled);
        else paintScale();
      }, settleMs);
    };

    publish(measure());
    const observer = new ResizeObserver(schedule);
    observer.observe(container);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      observer.disconnect();
      clearScale();
    };
  }, [container, content, settleMs]);

  useLayoutEffect(() => {
    if (!container || width == null) return;
    container.style.removeProperty(CONTENT_SCALE_VAR);
    container.style.removeProperty(SCALED_HEIGHT_VAR);
    container.style.overflow = "";
  }, [container, width]);

  const contentStyle = useMemo(
    () =>
      width == null ? scaledContentStyle : { ...scaledContentStyle, width },
    [width],
  );

  return { containerRef, contentRef, width, contentStyle };
}

export function ResizeContainer({
  children,
  className,
  settleMs = 200,
}: {
  children: (width: number | null) => ReactNode;
  className?: string;
  settleMs?: number;
}) {
  const { containerRef, contentRef, width, contentStyle } =
    useScaledElementWidth(settleMs);

  return (
    <div
      ref={containerRef}
      className={cn("w-full min-w-0", className)}
      style={containerStyle}
    >
      <div ref={contentRef} style={contentStyle}>
        {children(width)}
      </div>
    </div>
  );
}
