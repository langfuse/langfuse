"use client";

import type { ReactNode } from "react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "@/src/utils/tailwind";

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
        "bg-border/70 ring-offset-background focus-visible:ring-ring aria-[orientation=horizontal]:hover:bg-border relative flex w-px items-center justify-center transition-[background-color,box-shadow] duration-150 after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-2 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>[data-resizable-handle-pill]]:rotate-90",
        className,
      )}
      data-slot="spielwiese-resizable-handle"
      {...props}
    >
      {children}
      {withHandle ? (
        <div
          className="bg-border z-10 flex h-8 w-1.5 shrink-0 rounded-full"
          data-resizable-handle-pill
        />
      ) : null}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
