"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

type ControlledDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

/**
 * Dialog root whose open state is owned by the caller, for dialogs whose form
 * state lives above the dialog and must survive a close, or whose owner reads
 * or changes `open` outside the content. Prefer `DialogController` otherwise.
 */
function ControlledDialog({
  open,
  onOpenChange,
  children,
}: ControlledDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export { ControlledDialog };
