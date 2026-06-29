import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";

// Constrained width tokens (no free-form className) — `lg` is for confirms whose
// body carries longer content, e.g. a type-to-confirm field with a long name.
const confirmDialogContentVariants = cva("", {
  variants: {
    size: {
      default: "sm:max-w-md",
      lg: "sm:max-w-2xl",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

/**
 * Shared chrome for confirmation dialogs (delete/destructive actions). Owns the
 * borderless ("action") header/footer, description-in-body placement, and the
 * cancel/confirm footer so every confirm modal looks and behaves the same.
 * Callers keep their own access checks and mutation logic; pass extra content
 * (e.g. type-to-confirm input) via `children`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  confirmLabel = "Confirm",
  confirmVariant = "destructive",
  cancelLabel = "Cancel",
  onConfirm,
  loading = false,
  confirmDisabled = false,
  size,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  trigger?: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
} & VariantProps<typeof confirmDialogContentVariants>) {
  return (
    <Dialog
      open={open}
      // Ignore close requests (Esc / X / outside click / Cancel) while the
      // action is in flight, so a confirm can't be dismissed mid-mutation.
      onOpenChange={(next) => {
        if (loading && !next) return;
        onOpenChange(next);
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={confirmDialogContentVariants({ size })}>
        <DialogHeader variant="action">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
          {children}
        </DialogBody>
        <DialogFooter variant="action">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            loading={loading}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
