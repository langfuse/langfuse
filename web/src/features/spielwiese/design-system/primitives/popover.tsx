"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/src/utils/tailwind";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  align = "start",
  children,
  className,
  collisionAvoidance = {
    align: "shift",
    fallbackAxisSide: "none",
    side: "shift",
  },
  collisionPadding = 16,
  keepMounted = false,
  positionMethod = "fixed",
  side = "bottom",
  sideOffset = 8,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    | "align"
    | "collisionAvoidance"
    | "collisionPadding"
    | "keepMounted"
    | "positionMethod"
    | "side"
    | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal keepMounted={keepMounted}>
      <PopoverPrimitive.Positioner
        align={align}
        className="z-[140] outline-none"
        collisionAvoidance={collisionAvoidance}
        collisionPadding={collisionPadding}
        positionMethod={positionMethod}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            "origin-[var(--transform-origin)] outline-none",
            className,
          )}
          initialFocus={false}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
