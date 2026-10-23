"use client";

import * as React from "react";

import { HoverCardController } from "../HoverCardController/HoverCardController";

function ControlledHoverCard({
  content,
  ...props
}: React.ComponentProps<typeof HoverCardController>) {
  return (
    <HoverCardController
      {...props}
      content={
        <div className="bg-popover text-popover-foreground rounded-md border shadow-md">
          {content}
        </div>
      }
    />
  );
}

export { ControlledHoverCard };
