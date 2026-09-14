import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";

/**
 * Copy-first flow for Langfuse-managed widgets on a project dashboard:
 * editing one creates the project's own copy (the placement is rewired to
 * it) and opens the copy in the widget editor.
 */
export function CopyWidgetDialog({
  open,
  onOpenChange,
  widgetName,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetName: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Keep the dialog open while the copy is in flight (it navigates on
        // success).
        if (!nextOpen && isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit your copy of this widget</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-muted-foreground py-4 text-sm">
            <span className="text-foreground font-bold">
              &ldquo;{widgetName}&rdquo;
            </span>{" "}
            is maintained by Langfuse and can&rsquo;t be edited directly.
            We&rsquo;ll replace this tile with your own editable copy and open
            it in the widget editor — the rest of the dashboard stays unchanged.
          </p>
        </DialogBody>
        <DialogFooter>
          <div className="flex gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              type="button"
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={onConfirm} type="button" loading={isPending}>
              Create my copy
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
