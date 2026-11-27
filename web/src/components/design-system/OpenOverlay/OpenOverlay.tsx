"use client";

import { useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Drawer as DrawerPrimitive } from "vaul";

/**
 * Renders dialog or drawer content that is already open.
 * Stories use this instead of a controller whose children render nothing.
 */
export function OpenOverlay({
  children,
  surface = "dialog",
}: {
  children: ReactNode;
  surface?: "dialog" | "drawer";
}) {
  const [open, setOpen] = useState(true);
  if (surface === "drawer") {
    return (
      <DrawerPrimitive.Root open={open} onOpenChange={setOpen}>
        {children}
      </DrawerPrimitive.Root>
    );
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {children}
    </DialogPrimitive.Root>
  );
}
