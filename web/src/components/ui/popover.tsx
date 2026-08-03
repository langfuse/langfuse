"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/components/ui/layer";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    { className, align = "center", sideOffset = 4, forceMount, ...props },
    ref,
  ) => {
    // Route into the `popover` overlay layer (above `modal`, so popovers opened
    // inside a dialog render above it). null until mounted → falls back to
    // <body>, SSR-parity. Layer order, not z-index, stacks it.
    const container = useLayerContainer("popover");
    // Forward `forceMount` to BOTH the Portal and the Content: Radix's Portal
    // also gates on open state, so keeping the Content mounted while closed
    // requires both. Callers pair this with `data-[state=closed]:hidden` when they
    // need mounted-but-hidden content (e.g. a child whose effect must keep running
    // while the popover is closed). Undefined for everyone else → default behavior.
    return (
      <PopoverPrimitive.Portal container={container} forceMount={forceMount}>
        <PopoverPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          forceMount={forceMount}
          className={cn(
            "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 max-h-[calc(var(--radix-popover-content-available-height)-1rem)] max-w-[max(var(--radix-popover-trigger-width),fit-content)] min-w-72 overflow-y-auto rounded-md border p-3 shadow-md outline-hidden",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Portal>
    );
  },
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const PopoverClose = PopoverPrimitive.Close;

const PopoverAnchor = PopoverPrimitive.Anchor;

export { Popover, PopoverTrigger, PopoverContent, PopoverClose, PopoverAnchor };
