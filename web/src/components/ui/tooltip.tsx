/* eslint-disable @repo/no-style-props, @repo/component-file-structure, @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";

const TOOLTIP_DELAY_MS = 150;

/** Nested providers reset the delay, so every provider carries the app default. */
const TooltipProvider = ({
  delayDuration = TOOLTIP_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
);

/**
 * @deprecated Use Tooltip from design-system/Tooltip/Tooltip or CustomTooltip from design-system/CustomTooltip/CustomTooltip.
 */
const Tooltip = TooltipPrimitive.Root;

/**
 * @deprecated Use the render-prop getTriggerProps API of design-system/Tooltip/Tooltip or design-system/CustomTooltip/CustomTooltip.
 */
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * @deprecated Use the label prop of design-system/Tooltip/Tooltip or the content prop of design-system/CustomTooltip/CustomTooltip.
 */
const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  // Route into the `tooltip` overlay layer (above `popover`/`modal`, below
  // `toast`). null until mounted → falls back to <body>, SSR-parity. Layer
  // order, not z-index, stacks it.
  const container = useLayerContainer("tooltip");
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 overflow-hidden rounded-md border px-3 py-1.5 text-sm shadow-md",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
