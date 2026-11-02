"use client";

import type { ReactNode } from "react";

import { useElementSize } from "@/src/hooks/useElementSize";

export function ChartContainer({
  children,
}: {
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>();
  const width = containerSize?.width ?? 0;
  const height = containerSize?.height ?? 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full min-w-0 text-xs"
    >
      {children({ width, height })}
    </div>
  );
}
