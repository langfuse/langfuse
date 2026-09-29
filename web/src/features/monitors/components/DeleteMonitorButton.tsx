import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";

export function DeleteMonitorButton({
  monitorName,
  deleting,
  onDelete,
}: {
  monitorName: string;
  deleting: boolean;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await onDelete();
      setOpen(false);
    } catch {
      // The mutation reports the error while the dialog remains open for retry.
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Delete alert"
      description={`This permanently deletes "${monitorName}". This action cannot be undone.`}
      confirmLabel="Delete alert"
      loading={deleting}
      loadingText="Deleting alert..."
      onConfirm={handleDelete}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Delete alert"
          aria-label="Delete alert"
        >
          <Trash2 className="text-destructive h-4 w-4" />
        </Button>
      }
    />
  );
}
