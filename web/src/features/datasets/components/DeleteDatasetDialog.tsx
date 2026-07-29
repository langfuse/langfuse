import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { useState } from "react";

export interface DeleteDatasetDialogDataProps {
  projectId: string;
  datasetId: string;
  datasetName: string;
}

interface DeleteDatasetDialogProps extends DeleteDatasetDialogDataProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteDatasetDialog({
  projectId,
  datasetId,
  datasetName,
  open,
  onOpenChange,
}: DeleteDatasetDialogProps) {
  const capture = usePostHogClientCapture();
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const utils = api.useUtils();
  const deleteMutation = api.datasets.deleteDataset.useMutation();

  const handleDelete = async () => {
    capture("datasets:delete_form_submit");

    try {
      await deleteMutation.mutateAsync({ projectId, datasetId });
      utils.datasets.invalidate();
      setDeleteConfirmationInput("");
      onOpenChange(false);
    } catch {
      // The tRPC error handler owns mutation failures; keep the dialog open.
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) setDeleteConfirmationInput("");
      }}
      size="lg"
      title="Please confirm"
      description="This action cannot be undone and removes all the data associated with this dataset."
      confirmLabel="Delete dataset"
      confirmDisabled={deleteConfirmationInput !== datasetName}
      loading={deleteMutation.isPending}
      onConfirm={handleDelete}
    >
      <div className="grid w-full gap-1.5">
        <Label htmlFor="delete-confirmation">
          Type &quot;{datasetName}&quot; to confirm deletion
        </Label>
        <Input
          id="delete-confirmation"
          value={deleteConfirmationInput}
          onChange={(event) => setDeleteConfirmationInput(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
