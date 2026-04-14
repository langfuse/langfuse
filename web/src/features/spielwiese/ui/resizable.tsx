"use client";

import type { ReactNode } from "react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "@/src/utils/tailwind";

type ResizablePanelHandle = ResizablePrimitive.PanelImperativeHandle;

function ResizablePanelGroup({
  className,
  orientation,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 aria-[orientation=vertical]:flex-col [&>[data-panel]]:min-h-0 [&>[data-panel]]:min-w-0 [&>[data-panel]]:overflow-hidden [&>[data-separator]]:shrink-0",
        className,
      )}
      data-slot="spielwiese-resizable-panel-group"
      orientation={orientation}
      {...props}
    />
  );
}

function ResizablePanel({
  className,
  ...props
}: ResizablePrimitive.PanelProps) {
  return (
    <ResizablePrimitive.Panel
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden [&>*]:min-h-0",
        className,
      )}
      data-slot="spielwiese-resizable-panel"
      {...props}
    />
  );
}

function ResizableHandle({
  children,
  className,
  withHandle,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  children?: ReactNode;
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      className={cn(
        "group/resize-handle relative z-20 flex w-px items-center justify-center bg-transparent transition-[background-color] duration-180 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 focus-visible:outline-hidden aria-[orientation=horizontal]:h-4 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-7 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>[data-resizable-handle-pill]]:rotate-90 [&[aria-orientation=horizontal]>[data-resizable-hover-handle]]:rotate-90",
        className,
      )}
      data-slot="spielwiese-resizable-handle"
      {...props}
    >
      {children}
      {!withHandle ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 z-20 h-1.5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(180deg,rgba(241,243,245,0.98),rgba(220,224,228,0.98))] shadow-[0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.06)] transition-[opacity,transform,box-shadow] duration-180 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover/resize-handle:scale-95 group-hover/resize-handle:opacity-0 group-focus-visible/resize-handle:scale-95 group-focus-visible/resize-handle:opacity-0"
          data-testid="spielwiese-resizable-handle-resting-pill"
          data-resizable-handle-resting-pill
        />
      ) : null}
      {!withHandle ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 z-30 flex h-10 w-5 -translate-x-1/2 -translate-y-1/2 scale-95 items-center justify-center rounded-full border border-[rgba(255,255,255,0.76)] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,242,245,0.98)_54%,rgba(229,232,236,0.98))] opacity-0 shadow-[0_1px_0_rgba(255,255,255,0.98),0_10px_22px_rgba(15,23,42,0.14),0_2px_6px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(15,23,42,0.08)] transition-[opacity,transform,box-shadow] duration-180 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover/resize-handle:scale-100 group-hover/resize-handle:opacity-100 group-hover/resize-handle:shadow-[0_1px_0_rgba(255,255,255,0.98),0_12px_24px_rgba(15,23,42,0.16),0_3px_8px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.94),inset_0_-1px_0_rgba(15,23,42,0.08)] group-focus-visible/resize-handle:scale-100 group-focus-visible/resize-handle:opacity-100 group-focus-visible/resize-handle:shadow-[0_1px_0_rgba(255,255,255,0.98),0_12px_24px_rgba(15,23,42,0.16),0_3px_8px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.94),inset_0_-1px_0_rgba(15,23,42,0.08)]"
          data-resizable-hover-handle
        >
          <div className="absolute inset-x-1 top-1 h-2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(255,255,255,0))]" />
          <div className="flex flex-col gap-1">
            <span className="h-px w-2 rounded-full bg-[rgba(15,23,42,0.18)] shadow-[0_1px_0_rgba(255,255,255,0.82)]" />
            <span className="h-px w-2 rounded-full bg-[rgba(15,23,42,0.18)] shadow-[0_1px_0_rgba(255,255,255,0.82)]" />
            <span className="h-px w-2 rounded-full bg-[rgba(15,23,42,0.18)] shadow-[0_1px_0_rgba(255,255,255,0.82)]" />
          </div>
        </div>
      ) : null}
      {withHandle ? (
        <div
          className="bg-border z-10 flex h-8 w-1.5 shrink-0 rounded-full"
          data-resizable-handle-pill
        />
      ) : null}
    </ResizablePrimitive.Separator>
  );
}

export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ResizablePanelHandle,
};
