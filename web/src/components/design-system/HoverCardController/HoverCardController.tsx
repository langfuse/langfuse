"use client";

import * as React from "react";

import { FloatingController } from "../FloatingController/FloatingController";

function HoverCardController({
  content,
  ...props
}: Omit<
  React.ComponentProps<typeof FloatingController>,
  "role" | "hoverableContent" | "isScrollable" | "renderContent"
> & { content: React.ReactElement }) {
  return (
    <FloatingController
      {...props}
      renderContent={(floatingProps) => (
        <div
          aria-label="Preview"
          className="animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 outline-hidden"
          {...floatingProps}
        >
          {content}
        </div>
      )}
    />
  );
}

export { HoverCardController };
