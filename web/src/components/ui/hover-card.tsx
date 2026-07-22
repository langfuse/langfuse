"use client";

import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/components/ui/layer";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

// Route into the `popover` overlay layer (same as HoverCardContent). null until
// mounted → falls back to <body>, SSR-parity. Layer order, not z-index, stacks
// it. An explicit `container` prop still overrides the default.
const HoverCardPortal = ({
  ...props
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Portal>) => {
  const container = useLayerContainer("popover");
  return <HoverCardPrimitive.Portal container={container} {...props} />;
};
HoverCardPortal.displayName = "HoverCardPortal";

const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  // Route into the `popover` overlay layer. null until mounted → falls back to
  // <body>, SSR-parity. Layer order, not z-index, stacks it.
  const container = useLayerContainer("popover");
  return (
    <HoverCardPrimitive.Portal container={container}>
      <HoverCardPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-64 rounded-md border p-3 shadow-md outline-hidden",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
});
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

const HoverCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "p-2 text-sm leading-none font-bold tracking-tight",
      className,
    )}
    {...props}
  />
));
HoverCardTitle.displayName = "HoverCardTitle";

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  HoverCardTitle,
  HoverCardPortal,
};
