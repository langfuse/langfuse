"use client";

import * as React from "react";

import { FloatingController } from "../FloatingController/FloatingController";

function PopoverController({
  content,
  interaction = "click",
  ...props
}: Omit<
  React.ComponentProps<typeof FloatingController>,
  "role" | "renderContent"
> & { content: React.ReactElement }) {
  return (
    <FloatingController
      {...props}
      containInParentOverlay
      interaction={interaction}
      renderContent={(floatingProps) => (
        <div
          className="animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 outline-hidden"
          {...floatingProps}
        >
          {content}
        </div>
      )}
    />
  );
}

export { PopoverController };
