"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";
import { FloatingController } from "../FloatingController/FloatingController";

const tooltipVariants = cva(
  "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 max-w-xs rounded-md border text-sm shadow-md",
  {
    variants: {
      padding: { default: "px-3 py-1.5", uniform: "p-2" },
      overflow: {
        hidden: "overflow-hidden",
        scroll: "overflow-x-hidden overflow-y-auto overscroll-contain",
      },
    },
  },
);

function CustomTooltip({
  children,
  content,
  delay = 150,
  hoverableContent = true,
  placement = "top",
  padding = "default",
  overflow = "hidden",
}: Pick<
  React.ComponentProps<typeof FloatingController>,
  "children" | "placement" | "hoverableContent"
> & {
  content: React.ReactElement;
  delay?: number;
  padding?: NonNullable<VariantProps<typeof tooltipVariants>["padding"]>;
  overflow?: NonNullable<VariantProps<typeof tooltipVariants>["overflow"]>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <FloatingController
      open={open}
      onOpenChange={setOpen}
      role="tooltip"
      openDelay={delay}
      closeDelay={0}
      placement={placement}
      hoverableContent={hoverableContent}
      isScrollable={overflow === "scroll"}
      renderContent={(floatingProps) => (
        <div
          {...floatingProps}
          className={cn(
            tooltipVariants({ padding, overflow }),
            !hoverableContent && "pointer-events-none",
          )}
        >
          {content}
        </div>
      )}
    >
      {children}
    </FloatingController>
  );
}

export { CustomTooltip };
